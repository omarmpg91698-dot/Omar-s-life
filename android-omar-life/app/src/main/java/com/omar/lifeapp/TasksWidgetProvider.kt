package com.omar.lifeapp

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Home-screen widget: weather line + up to 3 open tasks, written by the web
 * app through OmarNativeBridge.updateWidget() and rendered from shared prefs.
 */
class TasksWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateOne(context, appWidgetManager, id)
        }
    }

    companion object {
        fun updateAll(context: Context) {
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, TasksWidgetProvider::class.java))
                for (id in ids) {
                    updateOne(context, mgr, id)
                }
            } catch (_: Exception) {
            }
        }

        private fun updateOne(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            try {
                val views = RemoteViews(context.packageName, R.layout.widget_tasks)
                val prefs = context.getSharedPreferences(OmarNativeBridge.PREFS_NAME, Context.MODE_PRIVATE)
                val raw = prefs.getString(OmarNativeBridge.KEY_WIDGET_DATA, null)

                var weather = ""
                var more = 0
                val tasks = ArrayList<String>()
                if (raw != null) {
                    try {
                        val obj = JSONObject(raw)
                        weather = obj.optString("weather", "")
                        val arr = obj.optJSONArray("tasks")
                        if (arr != null) {
                            for (i in 0 until arr.length()) {
                                val t = arr.optString(i).trim()
                                if (t.isNotEmpty()) tasks.add(t)
                            }
                        }
                        more = obj.optInt("moreCount", 0)
                    } catch (_: Exception) {
                    }
                }

                views.setTextViewText(
                    R.id.widget_weather,
                    if (weather.isNotEmpty()) weather else "افتح التطبيق لتحديث الطقس",
                )

                val slots = intArrayOf(R.id.widget_task_1, R.id.widget_task_2, R.id.widget_task_3)
                if (tasks.isEmpty()) {
                    views.setViewVisibility(slots[0], View.VISIBLE)
                    views.setTextViewText(slots[0], "مفيش مهام مفتوحة، يومك فاضي 🎉")
                    for (i in 1 until slots.size) views.setViewVisibility(slots[i], View.GONE)
                } else {
                    for (i in slots.indices) {
                        if (i < tasks.size) {
                            views.setViewVisibility(slots[i], View.VISIBLE)
                            views.setTextViewText(slots[i], "• " + tasks[i])
                        } else {
                            views.setViewVisibility(slots[i], View.GONE)
                        }
                    }
                }

                if (more > 0) {
                    views.setViewVisibility(R.id.widget_more, View.VISIBLE)
                    views.setTextViewText(R.id.widget_more, "+$more مهام تانية")
                } else {
                    views.setViewVisibility(R.id.widget_more, View.GONE)
                }

                val openIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val openPi = PendingIntent.getActivity(
                    context,
                    0,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.widget_root, openPi)

                mgr.updateAppWidget(widgetId, views)
            } catch (_: Exception) {
            }
        }
    }
}
