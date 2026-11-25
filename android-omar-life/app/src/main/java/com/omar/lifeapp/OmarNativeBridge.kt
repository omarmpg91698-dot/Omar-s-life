package com.omar.lifeapp

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import org.json.JSONArray

/**
 * Javascript bridge injected as window.OmarNative. Lets the web app schedule
 * day-before occasion notifications and push today's tasks + weather line to
 * the home-screen widget. Every method is defensive: a bad payload must never
 * crash the WebView.
 */
class OmarNativeBridge(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @JavascriptInterface
    fun scheduleOccasions(json: String) {
        try {
            cancelOccasions()
            val arr = JSONArray(json)
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val scheduled = ArrayList<String>()
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val id = item.optString("id", "occ-$i")
                val title = item.optString("title", "مناسبة قريبة")
                val body = item.optString("body", "")
                val triggerAt = item.optLong("triggerAt", 0L)
                if (triggerAt <= System.currentTimeMillis()) continue
                val requestCode = (i + 1) * 7919 + (id.hashCode() and 0xfff)
                val intent = Intent(context, OccasionAlarmReceiver::class.java).apply {
                    putExtra(EXTRA_TITLE, title)
                    putExtra(EXTRA_BODY, body)
                    putExtra(EXTRA_NOTIF_ID, requestCode)
                }
                val pi = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                try {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                    scheduled.add(requestCode.toString())
                } catch (_: Exception) {
                    // exact-alarm or quota issues: skip this one
                }
            }
            prefs.edit().putString(KEY_OCC_IDS, scheduled.joinToString(",")).apply()
        } catch (_: Exception) {
            // malformed payload: ignore
        }
    }

    @JavascriptInterface
    fun cancelOccasions() {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val saved = prefs.getString(KEY_OCC_IDS, "") ?: ""
            if (saved.isNotEmpty()) {
                for (part in saved.split(",")) {
                    val requestCode = part.toIntOrNull() ?: continue
                    val intent = Intent(context, OccasionAlarmReceiver::class.java)
                    val pi = PendingIntent.getBroadcast(
                        context,
                        requestCode,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    )
                    try {
                        alarmManager.cancel(pi)
                    } catch (_: Exception) {
                    }
                }
            }
            prefs.edit().remove(KEY_OCC_IDS).apply()
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface
    fun updateWidget(json: String) {
        try {
            prefs.edit().putString(KEY_WIDGET_DATA, json).apply()
            TasksWidgetProvider.updateAll(context)
        } catch (_: Exception) {
        }
    }

    companion object {
        const val PREFS_NAME = "omar_native"
        const val KEY_OCC_IDS = "occ_ids"
        const val KEY_WIDGET_DATA = "widget_data"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_NOTIF_ID = "notifId"
    }
}
