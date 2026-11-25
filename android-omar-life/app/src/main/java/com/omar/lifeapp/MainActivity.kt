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

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            callback.onReceiveValue(uris)
        }

    // Serve the whole origin from assets/www so Vite's root-relative paths
    // (/assets/index.js, /manifest.webmanifest, /sw.js, /icon.svg) resolve naturally.
    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
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
                    if (url.host == APP_ASSETS_HOST) {
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

        setContentView(webView)

        createNotificationChannel()
        maybeRequestNotificationPermission()

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

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
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
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_OCCASIONS = "occasions"
        private const val REQUEST_NOTIFICATIONS = 4101
        private const val APP_ASSETS_HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://appassets.androidplatform.net/index.html"

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
