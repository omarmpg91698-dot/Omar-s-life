package com.omarai.assistant.tools

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.omarai.assistant.data.local.OmarAiDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

/**
 * Restores all active recurring and upcoming reminders with Android AlarmManager
 * after device reboot or app update.
 */
class BootReminderReschedulerReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val dao = OmarAiDatabase.getInstance(context).reminderDao()
                val scheduler = ReminderAlarmScheduler(context)
                val now = ZonedDateTime.now()
                val nowMillis = now.toInstant().toEpochMilli()

                val activeReminders = dao.getEnabledSnapshot()
                for (reminder in activeReminders) {
                    val triggerMillis = if (reminder.nextTriggerMillis > nowMillis) {
                        reminder.nextTriggerMillis
                    } else if (reminder.recurrence != ReminderScheduleCalculator.RECURRENCE_ONCE) {
                        val days = ReminderScheduleCalculator.parseDaysCsv(reminder.daysOfWeekCsv)
                        ReminderScheduleCalculator.computeNextTriggerMillis(
                            hour = reminder.hour,
                            minute = reminder.minute,
                            recurrence = reminder.recurrence,
                            daysOfWeek = days,
                            now = now
                        )
                    } else {
                        continue
                    }

                    val updated = reminder.copy(nextTriggerMillis = triggerMillis)
                    dao.upsert(updated)
                    scheduler.schedule(updated)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
