package com.zencounter.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
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
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
        // Charset указываем ТОЛЬКО вторым аргументом WebResourceResponse (encoding).
        // Если прописать его внутри mimeType, часть версий WebView отдаёт рендереру
        // невалидный Content-Type — и документ показывается текстом, а не рисуется.
        MIME.put("html", "text/html");
        MIME.put("htm", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
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

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Через небольшую паузу проверяем, что документ отрисован как HTML
                // и приложение запустилось; если нет — аварийная автономная загрузка.
                view.postDelayed(() -> verifyRender(view, url), 400);
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
            logServe(path + "=" + mime);
            return new WebResourceResponse(mime, "UTF-8", in);
        } catch (IOException e) {
            logServe(path + "!нет");
            if (mime.startsWith("text/html")) {
                // Главный документ: отдаём HTML-страницу ошибки. Раньше здесь был
                // пустой text/plain — WebView показал бы его как текст.
                String page = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                        + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                        + "<title>Дзен счётчик</title></head>"
                        + "<body style=\"font-family:sans-serif;background:#0b1020;color:#e8ecff;"
                        + "padding:24px\"><h3>Дзен счётчик</h3><p>Не удалось открыть файл:<br>"
                        + path + "</p></body></html>";
                return new WebResourceResponse("text/html", "UTF-8",
                        new ByteArrayInputStream(page.getBytes(StandardCharsets.UTF_8)));
            }
            return null; // прочие файлы — WebView сам разберётся (в сеть выйти нечем)
        }
    }

    /* ============ Контроль рендера, аварийный путь и диагностика ============ */

    private final Object logLock = new Object();
    private final StringBuilder serveLog = new StringBuilder();
    private boolean inlineFallbackUsed = false;
    private boolean diagBannerShown = false;
    /** Страница сама сообщила (ZenBridge.rendered), что приложение запустилось. */
    private volatile boolean renderReported = false;
    private TextView diagView = null;

    private void logServe(String entry) {
        synchronized (logLock) {
            if (serveLog.length() > 300) serveLog.setLength(0);
            serveLog.append(entry).append("; ");
        }
    }

    private String serveLogText() {
        synchronized (logLock) {
            return serveLog.toString();
        }
    }

    /** Читает файл из assets в строку UTF-8; null, если файла нет. */
    private String readAssetText(String path) {
        try (InputStream in = getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Собирает страницу в один HTML: CSS и JS встроены прямо внутрь.
     * Такой документ отрисовывается без единого перехваченного запроса —
     * аварийный путь, когда отдача из assets по somehow не срабатывает.
     */
    private String buildInlinedPage() {
        String html = readAssetText("www/index.html");
        String css = readAssetText("www/styles.css");
        String js = readAssetText("www/app.js");
        if (html == null || css == null || js == null) return null;
        html = html.replace("<link rel=\"stylesheet\" href=\"styles.css\" />",
                "<style>\n" + css + "\n</style>");
        html = html.replace("<script src=\"app.js\" defer></script>",
                "<script>\n" + js + "\n</script>");
        return html;
    }

    /**
     * Проба состояния страницы. Возвращает объект, а не JSON.stringify:
     * evaluateJavascript сам упаковывает результат в JSON, а двойная упаковка
     * превращалась в строку — разбор молча падал и окно диагностики
     * срабатывало ложно.
     */
    private static final String JS_PROBE =
            "(function(){try{var b=document.body?document.body.innerText:'';"
            + "return {ct:String(document.contentType||''),"
            + "zen:String(typeof window.__zen),"
            + "sh:(document.styleSheets?document.styleSheets.length:0),"
            + "head:b.replace(/\\s+/g,' ').slice(0,60)}"
            + "}catch(e){return {err:String(e)}}})()";

    /**
     * Проверяет, что документ отрисован как HTML и приложение запустилось.
     * Иначе один раз перезагружает страницу автономно (всё встроено в HTML),
     * а если и это не помогло — показывает диагностику поверх WebView.
     */
    private void verifyRender(final WebView view, final String url) {
        if (view == null || url == null || !url.startsWith("https://" + APP_HOST)) return;
        final boolean fallback = inlineFallbackUsed;
        try {
            view.evaluateJavascript(JS_PROBE, value -> {
                if (renderReported) return; // страница уже подтвердила запуск
                String ct = "", zen = "", head = "", err = "";
                int sheets = -1;
                if (value != null && !"null".equals(value)) {
                    try {
                        // Разбираем в два шага: наружу может прийти и объект,
                        // и строка с JSON внутри — оба варианта должны читаться.
                        Object parsed = new JSONTokener(value).nextValue();
                        if (parsed instanceof String) {
                            parsed = new JSONTokener((String) parsed).nextValue();
                        }
                        if (parsed instanceof JSONObject) {
                            JSONObject o = (JSONObject) parsed;
                            ct = o.optString("ct", "");
                            zen = o.optString("zen", "");
                            head = o.optString("head", "");
                            sheets = o.optInt("sh", -1);
                            err = o.optString("err", "");
                        }
                    } catch (Exception ignore) {
                    }
                }
                boolean rendered = ct.contains("html") && "object".equals(zen);
                String stage = fallback ? "inline" : "primary";
                report(stage, rendered ? "ok" : (value == null ? "js-off" : ct),
                        zen, sheets, head, err);
                if (rendered) return;

                if (!fallback) {
                    String html = buildInlinedPage();
                    if (html != null) {
                        inlineFallbackUsed = true;
                        view.loadDataWithBaseURL(APP_URL, html, "text/html", "UTF-8", null);
                        return;
                    }
                }
                showDiag("стадия: " + stage
                        + "\ncontentType: " + (ct.isEmpty() ? "?" : ct)
                        + "\njs: " + (zen.isEmpty() ? "нет" : zen)
                        + "\nлистов стилей: " + sheets
                        + "\nurl: " + url
                        + "\nперехват: " + serveLogText()
                        + (err.isEmpty() ? "" : "\nошибка: " + err)
                        + (head.isEmpty() ? "" : "\nтекст: " + head));
            });
        } catch (Throwable t) {
            logServe("probe:" + t.getClass().getSimpleName());
        }
    }

    /** Технический отчёт в локальный сервер разработки; сбои тихо игнорируются. */
    private void report(final String stage, final String ct, final String zen,
                        final int sheets, final String head, final String err) {
        new Thread(() -> {
            try {
                String ver;
                try {
                    ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                } catch (Exception e) {
                    ver = "?";
                }
                String q = "v=" + enc(ver) + "&stage=" + enc(stage) + "&ct=" + enc(ct)
                        + "&zen=" + enc(zen) + "&sh=" + sheets + "&head=" + enc(head)
                        + "&err=" + enc(err) + "&serve=" + enc(serveLogText());
                HttpURLConnection c = (HttpURLConnection)
                        new URL("http://127.0.0.1:8765/r?" + q).openConnection();
                c.setConnectTimeout(1200);
                c.setReadTimeout(1200);
                c.getResponseCode();
                c.disconnect();
            } catch (Throwable ignored) {
            }
        }).start();
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s == null ? "" : s, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    /** Полоса диагностики поверх страницы — только при реально неудачном старте. */
    private void showDiag(final String text) {
        if (diagBannerShown || renderReported) return;
        diagBannerShown = true;
        runOnUiThread(() -> {
            if (renderReported) {
                // Пока собирали окно, страница успела подтвердить запуск
                diagBannerShown = false;
                return;
            }
            TextView tv = new TextView(MainActivity.this);
            tv.setText("ДИАГНОСТИКА ДЗЕН\n" + text);
            tv.setTextColor(Color.WHITE);
            tv.setBackgroundColor(0xF0000000);
            tv.setTextSize(11);
            tv.setPadding(24, 32, 24, 24);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP);
            diagView = tv;
            addContentView(tv, lp);
        });
    }

    /** Убирает полосу диагностики, когда страница подтвердила запуск. */
    private void removeDiag() {
        runOnUiThread(() -> {
            TextView v = diagView;
            diagView = null;
            diagBannerShown = false;
            if (v != null && v.getParent() instanceof FrameLayout) {
                ((FrameLayout) v.getParent()).removeView(v);
            }
        });
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

        /**
         * Страница сама подтверждает, что отрисована и приложение запустилось.
         * Основной сигнал «всё хорошо»: он приходит из работающего JS и не
         * зависит от формата, в котором evaluateJavascript возвращает результат.
         */
        @android.webkit.JavascriptInterface
        public void rendered() {
            renderReported = true;
            removeDiag();
            report("bridge", "ok", "object", -1, "", "");
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
