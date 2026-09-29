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
                int contentLength = 0;
                String header;
                while (!(header = reader.readLine()).isEmpty()) {
                    if (header.toLowerCase().startsWith("content-length:")) contentLength = Integer.parseInt(header.substring(header.indexOf(':') + 1).trim());
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
                byte[] response = payload.getBytes(StandardCharsets.UTF_8);
                OutputStream output = connection.getOutputStream();
                output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + response.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(response);
                output.flush();
            } catch (Exception ignored) {
            }
        }
    }
}
