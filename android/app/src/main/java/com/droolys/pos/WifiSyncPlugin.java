package com.droolys.pos;

import android.content.Context;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

@CapacitorPlugin(name = "WifiSync")
public class WifiSyncPlugin extends Plugin {
    private static final int SYNC_PORT = 8765;
    private static final int DISCOVERY_PORT = 8766;
    private static final String DISCOVERY_REQUEST = "DROOLYS_SYNC_DISCOVER_V1";
    private static final String DISCOVERY_RESPONSE = "DROOLYS_SYNC_ADMIN_V1";
    private SyncServer server;

    @PluginMethod
    public void startServer(PluginCall call) {
        if (server != null) server.stop();
        server = new SyncServer();
        server.start();
        JSObject result = new JSObject();
        result.put("host", localAddress());
        result.put("port", server.port());
        call.resolve(result);
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (server != null) server.stop();
        server = null;
        call.resolve();
    }

    @PluginMethod
    public void setServerPayload(PluginCall call) {
        if (server != null) server.setPayload(call.getString("payload", "{}"));
        call.resolve();
    }

    @PluginMethod
    public void setPortalPayload(PluginCall call) {
        if (server != null) server.setPortal(call.getString("payload", "{}"), call.getString("accessCode", ""));
        call.resolve();
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", SYNC_PORT);
        String payload = call.getString("payload", "{}");
        new Thread(() -> {
            try {
                URL url = new URL("http://" + host + ":" + port + "/sync");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] body = payload.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
                String response = readBody(connection);
                JSObject result = new JSObject();
                result.put("payload", response);
                getBridge().executeOnMainThread(() -> call.resolve(result));
            } catch (Exception error) {
                getBridge().executeOnMainThread(() -> call.reject(error.getMessage()));
            }
        }).start();
    }

    @PluginMethod
    public void discoverAdmin(PluginCall call) {
        new Thread(() -> {
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setBroadcast(true);
                socket.setSoTimeout(3500);
                byte[] request = DISCOVERY_REQUEST.getBytes(StandardCharsets.UTF_8);
                socket.send(new DatagramPacket(request, request.length, InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT));

                byte[] responseBuffer = new byte[256];
                while (true) {
                    DatagramPacket response = new DatagramPacket(responseBuffer, responseBuffer.length);
                    socket.receive(response);
                    String message = new String(response.getData(), response.getOffset(), response.getLength(), StandardCharsets.UTF_8);
                    String[] values = message.split("\\|", 3);
                    if (values.length != 3 || !DISCOVERY_RESPONSE.equals(values[0])) continue;
                    JSObject result = new JSObject();
                    result.put("host", values[1]);
                    result.put("port", Integer.parseInt(values[2]));
                    getBridge().executeOnMainThread(() -> call.resolve(result));
                    return;
                }
            } catch (SocketTimeoutException error) {
                getBridge().executeOnMainThread(() -> call.reject("Admin not found. On the Admin phone, press Share today's orders first."));
            } catch (Exception error) {
                getBridge().executeOnMainThread(() -> call.reject(error.getMessage()));
            }
        }).start();
    }

    private String readBody(HttpURLConnection connection) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            return body.toString();
        }
    }

    private String localAddress() {
        try {
            WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            int wifiAddress = wifiManager == null ? 0 : wifiManager.getConnectionInfo().getIpAddress();
            if (wifiAddress != 0) {
                return (wifiAddress & 0xff) + "." + ((wifiAddress >> 8) & 0xff) + "." + ((wifiAddress >> 16) & 0xff) + "." + ((wifiAddress >> 24) & 0xff);
            }
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback() || network.isVirtual()) continue;
                for (java.net.InetAddress address : Collections.list(network.getInetAddresses())) {
                    if (!address.isLoopbackAddress() && address.getHostAddress().indexOf(':') < 0) return address.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        return "0.0.0.0";
    }

    private class SyncServer implements Runnable {
        private volatile boolean running;
        private volatile String payload = "{}";
        private volatile String portalPayload = "{}";
        private volatile String portalAccessCode = "";
        private ServerSocket socket;
        private DatagramSocket discoverySocket;

        void start() {
            running = true;
            new Thread(this).start();
            new Thread(this::listenForDiscovery).start();
        }

        int port() {
            return socket == null ? 8765 : socket.getLocalPort();
        }

        void setPayload(String value) {
            payload = value == null ? "{}" : value;
        }

        void setPortal(String value, String accessCode) {
            portalPayload = value == null ? "{}" : value;
            portalAccessCode = accessCode == null ? "" : accessCode;
        }

        void stop() {
            running = false;
            try {
                if (socket != null) socket.close();
                if (discoverySocket != null) discoverySocket.close();
            } catch (IOException ignored) {
            }
        }

        @Override
        public void run() {
            try (ServerSocket listener = new ServerSocket(SYNC_PORT)) {
                socket = listener;
                while (running) handle(listener.accept());
            } catch (IOException ignored) {
            }
        }

        private void listenForDiscovery() {
            try (DatagramSocket listener = new DatagramSocket(DISCOVERY_PORT)) {
                discoverySocket = listener;
                byte[] buffer = new byte[256];
                while (running) {
                    DatagramPacket request = new DatagramPacket(buffer, buffer.length);
                    listener.receive(request);
                    String message = new String(request.getData(), request.getOffset(), request.getLength(), StandardCharsets.UTF_8);
                    if (!DISCOVERY_REQUEST.equals(message)) continue;
                    String response = DISCOVERY_RESPONSE + "|" + localAddress() + "|" + port();
                    byte[] responseBytes = response.getBytes(StandardCharsets.UTF_8);
                    listener.send(new DatagramPacket(responseBytes, responseBytes.length, request.getAddress(), request.getPort()));
                }
            } catch (IOException ignored) {
            }
        }

        private void handle(Socket client) {
            try (Socket connection = client) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
                String requestLine = reader.readLine();
                if (requestLine == null) return;
                String[] request = requestLine.split(" ", 3);
                if (request.length < 2) return;
                int contentLength = 0;
                String header;
                while ((header = reader.readLine()) != null && !header.isEmpty()) {
                    if (header.toLowerCase().startsWith("content-length:")) contentLength = Integer.parseInt(header.substring(header.indexOf(':') + 1).trim());
                }
                if ("GET".equals(request[0]) && "/".equals(stripQuery(request[1]))) {
                    respond(connection, 200, "text/html; charset=utf-8", portalPage());
                    return;
                }
                if ("GET".equals(request[0]) && "/portal".equals(stripQuery(request[1]))) {
                    if (portalAccessCode.isEmpty() || !portalAccessCode.equals(queryValue(request[1], "key"))) {
                        respond(connection, 403, "text/plain; charset=utf-8", "Local admin access is unavailable.");
                    } else {
                        respond(connection, 200, "application/json; charset=utf-8", portalPayload);
                    }
                    return;
                }
                if (!"POST".equals(request[0]) || !"/sync".equals(stripQuery(request[1]))) {
                    respond(connection, 404, "text/plain; charset=utf-8", "Not found");
                    return;
                }
                char[] buffer = new char[contentLength];
                int read = 0;
                while (read < contentLength) {
                    int count = reader.read(buffer, read, contentLength - read);
                    if (count < 0) break;
                    read += count;
                }
                String incoming = new String(buffer, 0, read);
                getBridge().executeOnMainThread(() -> {
                    JSObject event = new JSObject();
                    event.put("payload", incoming);
                    notifyListeners("syncReceived", event);
                });
                respond(connection, 200, "application/json; charset=utf-8", payload);
            } catch (Exception ignored) {
            }
        }

        private void respond(Socket connection, int status, String type, String body) throws IOException {
            byte[] response = body.getBytes(StandardCharsets.UTF_8);
            String statusText = status == 200 ? "OK" : status == 403 ? "Forbidden" : "Not Found";
            OutputStream output = connection.getOutputStream();
            output.write(("HTTP/1.1 " + status + " " + statusText + "\r\nContent-Type: " + type + "\r\nContent-Length: " + response.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            output.write(response);
            output.flush();
        }

        private String stripQuery(String path) {
            int index = path.indexOf('?');
            return index < 0 ? path : path.substring(0, index);
        }

        private String queryValue(String path, String key) {
            int start = path.indexOf('?');
            if (start < 0) return "";
            for (String pair : path.substring(start + 1).split("&")) {
                String[] value = pair.split("=", 2);
                if (value.length == 2 && key.equals(value[0])) return value[1];
            }
            return "";
        }

        private String portalPage() {
            return "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Drooly's Local Admin</title><style>body{margin:0;background:#fff3f8;color:#17211f;font:15px Arial,sans-serif}main{max-width:1000px;margin:auto;padding:24px}h1{margin:0;border-bottom:2px solid #f32981;padding-bottom:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.box{background:#fff;border:1px solid #d9e3e0;padding:16px;border-radius:6px}.box b{display:block;font-size:26px;margin-top:6px}table{width:100%;border-collapse:collapse}th,td{padding:9px 5px;border-bottom:1px solid #d9e3e0;text-align:left;font-size:13px}@media(max-width:600px){main{padding:14px}.grid{grid-template-columns:1fr}.scroll{overflow:auto}table{min-width:620px}}</style><main><h1>Drooly's Local Admin</h1><p id='info'>Connecting...</p><div class='grid' id='stats'></div><section class='box'><h2>Orders</h2><div class='scroll'><table><thead><tr><th>Receipt</th><th>Customer</th><th>Schedule</th><th>Status</th><th>Total</th></tr></thead><tbody id='orders'></tbody></table></div></section><script>const x=v=>String(v||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));const p=n=>'PHP '+Number(n||0).toFixed(2);async function load(){try{let r=await fetch('/portal'+location.search,{cache:'no-store'});if(!r.ok)throw Error('Access link is not valid.');let d=await r.json(),o=d.orders||[],a=o.filter(v=>Number(v.amountReceived)>=Number(v.total)).reduce((n,v)=>n+Number(v.total||0),0);document.querySelector('#info').textContent='Updated '+new Date(d.updatedAt).toLocaleString();document.querySelector('#stats').innerHTML=[['Orders',o.length],['Paid sales',p(a)],['Products',(d.products||[]).filter(v=>v.active!==false).length]].map(v=>'<div class=box>'+v[0]+'<b>'+v[1]+'</b></div>').join('');document.querySelector('#orders').innerHTML=o.length?o.slice().reverse().map(v=>'<tr><td>'+x(v.receipt)+'</td><td>'+x(v.customer&&v.customer.name)+'</td><td>'+x(v.scheduledDate)+' '+x(v.scheduledTime)+'</td><td>'+x(v.status)+'</td><td>'+p(v.total)+'</td></tr>').join(''):'<tr><td colspan=5>No orders yet.</td></tr>'}catch(e){document.querySelector('#info').textContent=e.message}}load();setInterval(load,5000);</script></main>";
        }
    }
}
