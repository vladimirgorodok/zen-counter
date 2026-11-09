package com.zencounter.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * «Дзен счётчик» — обёртка WebView вокруг PWA из assets/www.
 *
 * Страница загружается с адреса https://appassets.androidplatform.net/..., а
 * shouldInterceptRequest отдаёт файлы из assets. Благодаря «настоящему» origin
 * у страницы работают localStorage, AudioContext и загрузка своих звуков —
 * ровно так же, как в браузере. Внешних зависимостей нет.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/assets/www/index.html";

    private static final String COLOR_BG = "#0b1020";
    private static final String COLOR_BAR = "#05080f";

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("htm", "text/html; charset=utf-8");
        MIME.put("js", "text/javascript; charset=utf-8");
        MIME.put("mjs", "text/javascript; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("webmanifest", "application/manifest+json; charset=utf-8");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff2", "font/woff2");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("wav", "audio/wav");
        MIME.put("ogg", "audio/ogg");
    }

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor(COLOR_BG));
        getWindow().setNavigationBarColor(Color.parseColor(COLOR_BAR));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor(COLOR_BG));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                 // localStorage приложения
        settings.setMediaPlaybackRequiresUserGesture(false); // звук тика без касания
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serveLocal(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Не удалось открыть выбор файла",
                            Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new Bridge(), "ZenBridge");
        webView.loadUrl(APP_URL);
    }

    /** Отдаёт файл приложения из assets по https-адресу appassets.androidplatform.net. */
    private WebResourceResponse serveLocal(Uri uri) {
        if (uri == null || !APP_HOST.equals(uri.getHost())) {
            return null; // чужие адресы — в сеть (у нас их нет)
        }
        String path = uri.getPath();
        if (path == null) path = "/";
        while (path.startsWith("/")) path = path.substring(1);
        // URL вида /assets/www/index.html → файл в assets: www/index.html
        if (path.startsWith("assets/")) path = path.substring("assets/".length());
        if (path.isEmpty() || path.endsWith("/")) path = path + "index.html";

        String ext = "";
        int dot = path.lastIndexOf('.');
        if (dot >= 0) ext = path.substring(dot + 1).toLowerCase(Locale.US);
        String mime = MIME.get(ext);
        if (mime == null) {
            String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            mime = guessed != null ? guessed : "application/octet-stream";
        }

        try {
            InputStream in = getAssets().open(path);
            return new WebResourceResponse(mime, "UTF-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8",
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        // Сначала даём приложению закрыть модалку / вернуться на главный экран
        webView.evaluateJavascript(
                "window.__zenBack ? String(window.__zenBack()) : 'false'",
                value -> {
                    if (!"true".equals(value)) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** Мост для страницы: удержание экрана во время работы счётчика. */
    public class Bridge {
        @android.webkit.JavascriptInterface
        public void keepScreenOn(final int on) {
            runOnUiThread(() -> {
                if (on == 1) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void vibrate(final int ms) {
            runOnUiThread(() -> {
                android.os.Vibrator vibrator =
                        (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (android.os.Build.VERSION.SDK_INT >= 26) {
                        vibrator.vibrate(android.os.VibrationEffect.createOneShot(
                                ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(ms);
                    }
                }
            });
        }
    }
}
