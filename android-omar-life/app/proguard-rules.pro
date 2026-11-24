# Keep WebView and AndroidX WebKit classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
