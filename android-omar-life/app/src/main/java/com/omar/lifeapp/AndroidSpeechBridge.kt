package com.omar.lifeapp

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * On-device Arabic speech recognition bridge (no network services beyond
 * Android's own recognizer). JS side talks to window.AndroidSpeech and gets
 * callbacks on window.__omarSpeechResult / __omarSpeechError / __omarSpeechState.
 */
class AndroidSpeechBridge(
    private val activity: Activity,
    private val evalJs: (String) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null

    @JavascriptInterface
    fun isAvailable(): Boolean =
        try {
            SpeechRecognizer.isRecognitionAvailable(activity)
        } catch (_: Exception) {
            false
        }

    @JavascriptInterface
    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            activity,
            android.Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

    @JavascriptInterface
    fun startListening() {
        handler.post {
            try {
                if (!isAvailable()) {
                    emit("__omarSpeechError", quote("unavailable"))
                    return@post
                }
                if (!hasPermission()) {
                    emit("__omarSpeechError", quote("no-permission"))
                    return@post
                }
                destroyRecognizer()
                val sr = SpeechRecognizer.createSpeechRecognizer(activity)
                recognizer = sr
                sr.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) = emitState("listening")
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() = emitState("processing")
                    override fun onPartialResults(partialResults: Bundle?) {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                    override fun onError(error: Int) {
                        val code = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH,
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "no-permission"
                            SpeechRecognizer.ERROR_NETWORK,
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
                            else -> "error-$error"
                        }
                        emit("__omarSpeechError", quote(code))
                        destroyRecognizer()
                    }
                    override fun onResults(results: Bundle?) {
                        val text = results
                            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()
                            .orEmpty()
                        emit("__omarSpeechResult", quote(text))
                        destroyRecognizer()
                    }
                })
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                    )
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
                sr.startListening(intent)
            } catch (_: Exception) {
                emit("__omarSpeechError", quote("exception"))
                destroyRecognizer()
            }
        }
    }

    @JavascriptInterface
    fun stopListening() {
        handler.post {
            try {
                recognizer?.stopListening()
            } catch (_: Exception) {
            }
            emitState("stopped")
        }
    }

    fun destroy() {
        handler.post { destroyRecognizer() }
    }

    private fun destroyRecognizer() {
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
    }

    private fun emit(callback: String, argJs: String) {
        evalJs("window.$callback && window.$callback($argJs)")
    }

    private fun emitState(state: String) = emit("__omarSpeechState", quote(state))

    private fun quote(value: String): String = JSONObject.quote(value)
}
