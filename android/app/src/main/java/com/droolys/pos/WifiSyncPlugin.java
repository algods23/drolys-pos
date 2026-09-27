package com.droolys.pos;

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
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

@CapacitorPlugin(name = "WifiSync")
public class WifiSyncPlugin extends Plugin {
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
        int port = call.getInt("port", 8765);
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
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
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

        void start() {
            running = true;
            new Thread(this).start();
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
            } catch (IOException ignored) {
            }
        }

        @Override
        public void run() {
            try (ServerSocket listener = new ServerSocket(8765)) {
                socket = listener;
                while (running) handle(listener.accept());
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
