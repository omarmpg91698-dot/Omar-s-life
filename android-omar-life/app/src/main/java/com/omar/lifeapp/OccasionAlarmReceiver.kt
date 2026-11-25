package com.omar.lifeapp

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/** Shows the day-before occasion notification fired by the scheduled alarm. */
class OccasionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        try {
            val title = intent.getStringExtra(OmarNativeBridge.EXTRA_TITLE) ?: return
            val body = intent.getStringExtra(OmarNativeBridge.EXTRA_BODY) ?: ""
            val notifId = intent.getIntExtra(
                OmarNativeBridge.EXTRA_NOTIF_ID,
                (System.currentTimeMillis() % 100_000).toInt(),
            )

            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val openPi = PendingIntent.getActivity(
                context,
                notifId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val notification = NotificationCompat.Builder(context, MainActivity.CHANNEL_OCCASIONS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(notifId, notification)
        } catch (_: Exception) {
            // never crash on a bad broadcast
        }
    }
}
