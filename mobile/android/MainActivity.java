package com.analoggeek.smartboardos;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Base64;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/index.html";
    private static final Pattern ASSET = Pattern.compile("/(?:index\\.html|manifest\\.webmanifest|(?:assets|css|js|vendor)/(?:[\\w-]+/)*[\\w.-]+)");
    private static final Pattern FILE_NAME = Pattern.compile("[^\\p{L}\\p{N} ._()\\-]");
    private static final long MAX_EXPORT = 128L * 1024 * 1024;
    private static final int PICK_FILE = 1, SAVE_FILE = 2, CAPTURE = 3;
    private WebView web;
    private ValueCallback<Uri[]> picker;
    private PermissionRequest capture;
    private File export;
    private FileOutputStream stream;
    private long bytes;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getPackageName().endsWith(".qa")) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 16, 32));
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            }
            return insets;
        });
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.addJavascriptInterface(new Exports(), "smartboardAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.isForMainFrame() || !local(request.getUrl()) || !"/index.html".equals(request.getUrl().getPath());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if ("GET".equals(request.getMethod()) && local(uri) && path != null && ASSET.matcher(path).matches()
                        && (!request.isForMainFrame() || "/index.html".equals(path))) {
                    String type = contentType(path);
                    if (type != null) try {
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
                        headers.put("X-Content-Type-Options", "nosniff");
                        return new WebResourceResponse(type, type.startsWith("image/") ? null : "UTF-8", 200, "OK", headers, getAssets().open("web" + path));
                    } catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                // ACTION_OPEN_DOCUMENT returns an explicit user-selected URI, without storage permission.
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                String[] mime = java.util.Arrays.stream(params.getAcceptTypes()).flatMap(s -> java.util.Arrays.stream(s.split(",")))
                    .map(String::trim).filter(s -> s.contains("/")).toArray(String[]::new);
                if (mime.length > 0) pick.putExtra(Intent.EXTRA_MIME_TYPES, mime);
                try { startActivityForResult(pick, PICK_FILE); } catch (RuntimeException e) { picker = null; callback.onReceiveValue(null); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (!local(request.getOrigin()) || capture != null) { request.deny(); return; }
                ArrayList<String> permissions = new ArrayList<>();
                for (String resource : request.getResources()) {
                    String permission = androidPermission(resource);
                    if (permission == null) { request.deny(); return; }
                    if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) permissions.add(permission);
                }
                if (permissions.isEmpty()) request.grant(request.getResources());
                else { capture = request; requestPermissions(permissions.toArray(new String[0]), CAPTURE); }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (capture == request) capture = null;
            }
        });
        web.loadUrl(ENTRY);
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1 && uri.getUserInfo() == null;
    }
    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg")) return "image/jpeg";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return null;
    }
    private static String androidPermission(String resource) {
        switch (resource) {
            case PermissionRequest.RESOURCE_VIDEO_CAPTURE: return Manifest.permission.CAMERA;
            case PermissionRequest.RESOURCE_AUDIO_CAPTURE: return Manifest.permission.RECORD_AUDIO;
            default: return null;
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != CAPTURE || capture == null) return;
        PermissionRequest current = capture; capture = null;
        for (String resource : current.getResources()) {
            if (checkSelfPermission(androidPermission(resource)) != PackageManager.PERMISSION_GRANTED) { current.deny(); return; }
        }
        current.grant(current.getResources());
    }

    private synchronized void discardExport() {
        try { if (stream != null) stream.close(); } catch (IOException ignored) { }
        stream = null;
        if (export != null) export.delete();
        export = null;
    }
    private final class Exports {
        @JavascriptInterface public boolean isBundled() { return true; }
        @JavascriptInterface public boolean begin(long length) {
            synchronized (MainActivity.this) {
                if (length < 0 || length > MAX_EXPORT || export != null) return false;
                try {
                    export = File.createTempFile("board-", ".export", getCacheDir());
                    stream = new FileOutputStream(export); bytes = 0; return true;
                } catch (IOException e) { discardExport(); return false; }
            }
        }
        @JavascriptInterface public boolean append(String chunk) {
            synchronized (MainActivity.this) {
                if (stream == null || chunk.length() > 100_000) return false;
                try {
                    byte[] data = Base64.decode(chunk, Base64.DEFAULT);
                    if (bytes + data.length > MAX_EXPORT) throw new IOException("Export is too large");
                    stream.write(data); bytes += data.length; return true;
                } catch (IOException | IllegalArgumentException e) { discardExport(); return false; }
            }
        }
        @JavascriptInterface public boolean finish(String title, String mime, long length) {
            synchronized (MainActivity.this) {
                if (stream == null || bytes != length) { discardExport(); return false; }
                try { stream.close(); stream = null; } catch (IOException e) { discardExport(); return false; }
            }
            String name = FILE_NAME.matcher(title.substring(0, Math.min(120, title.length()))).replaceAll("_").trim();
            String type = mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+") ? mime : "application/octet-stream";
            runOnUiThread(() -> {
                try { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(type)
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, name.isEmpty() ? "SmartBoardOS export" : name), SAVE_FILE); }
                catch (RuntimeException e) { discardExport(); notifyUser("No app can save the export"); }
            });
            return true;
        }
        @JavascriptInterface public void cancel() { discardExport(); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && picker != null) {
            ArrayList<Uri> picked = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    if (uri != null && "content".equals(uri.getScheme())) picked.add(uri);
                }
                else if (data.getData() != null && "content".equals(data.getData().getScheme())) picked.add(data.getData());
            }
            picker.onReceiveValue(picked.isEmpty() ? null : picked.toArray(new Uri[0])); picker = null;
        } else if (request == SAVE_FILE) {
            Uri destination = result == RESULT_OK && data != null ? data.getData() : null;
            if (destination == null || !"content".equals(destination.getScheme()) || export == null) { discardExport(); return; }
            File source = export;
            new Thread(() -> {
                try (FileInputStream from = new FileInputStream(source); OutputStream to = getContentResolver().openOutputStream(destination, "wt")) {
                    if (to == null) throw new IOException("Destination unavailable");
                    byte[] buffer = new byte[64 * 1024]; int n;
                    while ((n = from.read(buffer)) != -1) to.write(buffer, 0, n);
                    runOnUiThread(() -> notifyUser("Export saved"));
                } catch (IOException | SecurityException e) { runOnUiThread(() -> notifyUser("Couldn't save export")); }
                finally { discardExport(); }
            }, "board-export").start();
        }
    }
    private void notifyUser(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
    @Override protected void onDestroy() {
        if (picker != null) picker.onReceiveValue(null);
        if (capture != null) capture.deny();
        discardExport(); web.destroy(); super.onDestroy();
    }
}
