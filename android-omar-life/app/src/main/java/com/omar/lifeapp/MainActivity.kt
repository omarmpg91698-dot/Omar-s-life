package com.omar.lifeapp

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWidgetComplete: String? = null
    private var webViewReady = false
    private var speechBridge: AndroidSpeechBridge? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            callback.onReceiveValue(uris)
        }

    private var pendingAudioRequest: PermissionRequest? = null

    private val audioPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            pendingAudioRequest?.let { request ->
                if (granted) request.grant(request.resources) else request.deny()
            }
            pendingAudioRequest = null
        }

    // Serve the whole origin from assets/www so Vite's root-relative paths
    // (/assets/index.js, /manifest.webmanifest, /sw.js, /icon.svg) resolve naturally.
    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(APP_ASSETS_HOST)
            .addPathHandler("/") { path ->
                val clean = path.trimStart('/')
                val target = if (clean.isEmpty()) "www/index.html" else "www/$clean"
                try {
                    WebResourceResponse(guessMime(target), null, assets.open(target))
                } catch (_: Exception) {
                    null
                }
            }
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL

        webView = WebView(this).apply {
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            overScrollMode = View.OVER_SCROLL_NEVER

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                // Present as regular Chrome (not a WebView) so Google sign-in
                // doesn't reject the OAuth flow with disallowed_useragent.
                userAgentString = WebSettings.getDefaultUserAgent(this@MainActivity).replace("; wv", "")
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    webViewReady = true
                    flushWidgetComplete()
                }

                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    val uri = request.url
                    if (uri.host != APP_ASSETS_HOST) {
                        return null
                    }

                    val path = uri.path.orEmpty()
                    if (path == "/" || path == "/index.html") {
                        return loadPatchedIndexHtml()
                    }

                    return assetLoader.shouldInterceptRequest(uri)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val url = request.url
                    val host = url.host.orEmpty()
                    // Keep the Firebase/Google sign-in redirect chain inside the
                    // WebView; everything else external still opens in the browser.
                    if (host == APP_ASSETS_HOST ||
                        host == "firebaseapp.com" || host.endsWith(".firebaseapp.com") ||
                        host.endsWith(".google.com") || host.endsWith(".googleapis.com") ||
                        host.endsWith(".gstatic.com") || host.endsWith(".googleusercontent.com")
                    ) {
                        return false
                    }
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    val wantsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!wantsAudio) {
                        request.deny()
                        return
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            android.Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(request.resources)
                    } else {
                        pendingAudioRequest?.deny()
                        pendingAudioRequest = request
                        audioPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO)
                    }
                }

                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    return try {
                        fileChooserLauncher.launch(fileChooserParams.createIntent())
                        true
                    } catch (_: Exception) {
                        this@MainActivity.filePathCallback = null
                        false
                    }
                }
            }
        }

        // Keep the WebView clear of the system navigation bar (edge-to-edge is
        // enforced on targetSdk 35+, so decorFitsSystemWindows alone is not enough).
        ViewCompat.setOnApplyWindowInsetsListener(webView) { v, windowInsets ->
            val bars = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars())
            val lp = v.layoutParams as ViewGroup.MarginLayoutParams
            if (lp.bottomMargin != bars.bottom) {
                lp.bottomMargin = bars.bottom
                v.layoutParams = lp
            }
            windowInsets
        }

        webView.addJavascriptInterface(OmarNativeBridge(this), "OmarNative")
        speechBridge = AndroidSpeechBridge(this@MainActivity) { js ->
            webView.post { webView.evaluateJavascript(js, null) }
        }
        webView.addJavascriptInterface(speechBridge, "AndroidSpeech")

        setContentView(webView)

        createNotificationChannel()
        maybeRequestNotificationPermission()
        maybeRequestAudioPermission()

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        handleWidgetCompleteIntent(intent)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleWidgetCompleteIntent(intent)
        flushWidgetComplete()
    }

    private fun handleWidgetCompleteIntent(intent: Intent?) {
        val title = intent?.getStringExtra(TasksWidgetProvider.EXTRA_WIDGET_COMPLETE)?.trim()
        if (!title.isNullOrEmpty()) {
            pendingWidgetComplete = title
            intent.removeExtra(TasksWidgetProvider.EXTRA_WIDGET_COMPLETE)
        }
    }

    // Forward a widget ✓ tap to the web app once it is loaded; retry a few
    // times because the app may still be booting its React tree.
    private fun flushWidgetComplete(attempt: Int = 0) {
        val title = pendingWidgetComplete ?: return
        if (!webViewReady || attempt > 20) {
            if (attempt > 20) pendingWidgetComplete = null
            return
        }
        val js = "!!(window.__omarWidgetComplete && (window.__omarWidgetComplete(" +
            org.json.JSONObject.quote(title) + "), true))"
        webView.evaluateJavascript(js) { result ->
            if ("true" != result) {
                webView.postDelayed({ flushWidgetComplete(attempt + 1) }, 700)
            } else {
                pendingWidgetComplete = null
            }
        }
    }

    private fun createNotificationChannel() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) {
                val channel = NotificationChannel(
                    CHANNEL_OCCASIONS,
                    "مناسبات وأجازات",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "تذكير قبل كل مناسبة أو أجازة رسمية بيوم"
                }
                nm.createNotificationChannel(channel)
            }
        } catch (_: Exception) {
        }
    }

    private fun maybeRequestAudioPermission() {
        if (pendingAudioRequest != null) return
        if (ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            audioPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun maybeRequestNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_NOTIFICATIONS,
                )
            }
        } catch (_: Exception) {
        }
    }

    private fun loadPatchedIndexHtml(): WebResourceResponse? {
        return try {
            val rawHtml = assets.open("www/index.html").bufferedReader(Charsets.UTF_8).use {
                it.readText()
            }
            // Ensure Omar's Life organizer opens directly on first launch without touching web code
            val bootstrapScript =
                "<script>try{if(!window.localStorage.getItem('omar_workspace_mode_v1')){" +
                    "window.localStorage.setItem('omar_workspace_mode_v1','life');" +
                    "}}catch(e){}</script>"
            val patchedHtml = if (rawHtml.contains("<head>", ignoreCase = true)) {
                rawHtml.replaceFirst("<head>", "<head>$bootstrapScript", ignoreCase = true)
            } else {
                bootstrapScript + rawHtml
            }
            WebResourceResponse(
                "text/html",
                "UTF-8",
                ByteArrayInputStream(patchedHtml.toByteArray(Charsets.UTF_8))
            )
        } catch (_: Exception) {
            null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        speechBridge?.destroy()
        speechBridge = null
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_OCCASIONS = "occasions"
        private const val REQUEST_NOTIFICATIONS = 4101
        private const val APP_ASSETS_HOST = "localhost"
        private const val START_URL = "https://localhost/index.html"

        private fun guessMime(path: String): String? {
            return when (path.substringAfterLast('.', "").lowercase()) {
                "html" -> "text/html"
                "js", "mjs" -> "application/javascript"
                "css" -> "text/css"
                "json", "map" -> "application/json"
                "webmanifest" -> "application/manifest+json"
                "svg" -> "image/svg+xml"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "webp" -> "image/webp"
                "ico" -> "image/x-icon"
                "woff" -> "font/woff"
                "woff2" -> "font/woff2"
                "ttf" -> "font/ttf"
                "mp3" -> "audio/mpeg"
                "mp4" -> "video/mp4"
                else -> null
            }
        }
    }
}
