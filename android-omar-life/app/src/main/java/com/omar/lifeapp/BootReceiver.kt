package com.omar.lifeapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Alarms do not survive a device reboot. Replay the last occasion schedule
 * the web app handed us (cached in shared prefs); past triggers are skipped.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        try {
            val prefs = context.getSharedPreferences(OmarNativeBridge.PREFS_NAME, Context.MODE_PRIVATE)
            val specs = prefs.getString(OmarNativeBridge.KEY_OCC_SPECS, null) ?: return
            OmarNativeBridge.scheduleFromJson(context, specs)
        } catch (_: Exception) {
        }
    }
}
