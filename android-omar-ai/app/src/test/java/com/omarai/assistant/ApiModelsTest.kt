package com.omarai.assistant

import com.omarai.assistant.data.remote.ApiClientFactory
import com.omarai.assistant.data.remote.OmarAiChatResponse
import com.omarai.assistant.tools.ReminderScheduleCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

class ApiModelsTest {

    @Test
    fun parsesRecurringReminderToolCallCorrectly() {
        val raw = """
            {
              "reply": "تمام يا عمر، أجدولك تذكير يومي الساعة ٨ الصبح؟",
              "language": "ar-EG",
              "suggestedFollowUps": ["أيوه جدوله", "خليه ٨ ونص"],
              "toolCalls": [
                {
                  "type": "create_reminder",
                  "requiresConfirmation": true,
                  "confirmationPrompt": "تذكير يومي الساعة ٨:٠٠ ص: مراجعة خطة اليوم",
                  "title": "مراجعة خطة اليوم",
                  "reminderTime": "08:00",
                  "recurrence": "daily",
                  "daysOfWeek": []
                }
              ]
            }
        """.trimIndent()

        val decoded = ApiClientFactory.json.decodeFromString<OmarAiChatResponse>(raw)
        assertEquals("ar-EG", decoded.language)
        assertEquals(1, decoded.toolCalls.size)
        val tool = decoded.toolCalls.first()
        assertTrue(tool.requiresConfirmation)
        assertEquals("create_reminder", tool.type)
        assertEquals("08:00", tool.reminderTime)
        assertEquals("daily", tool.recurrence)
    }

    @Test
    fun calculatesDailyAndWeeklyRecurringTriggersAccurately() {
        val zone = ZoneId.of("Africa/Cairo")
        // Monday 2026-11-23 at 09:00 -> daily 08:00 must schedule for Tuesday 2026-11-24 at 08:00
        val mondayNineAm = ZonedDateTime.of(2026, 11, 23, 9, 0, 0, 0, zone)
        val nextDaily = ReminderScheduleCalculator.computeNextTriggerMillis(
            hour = 8,
            minute = 0,
            recurrence = ReminderScheduleCalculator.RECURRENCE_DAILY,
            now = mondayNineAm
        )
        val nextDailyZdt = Instant.ofEpochMilli(nextDaily).atZone(zone)
        assertEquals(24, nextDailyZdt.dayOfMonth)
        assertEquals(8, nextDailyZdt.hour)
        assertEquals(0, nextDailyZdt.minute)

        // Weekly on Wednesday (3) at 20:30 from Monday 09:00 -> Wednesday 2026-11-25 at 20:30
        val nextWeekly = ReminderScheduleCalculator.computeNextTriggerMillis(
            hour = 20,
            minute = 30,
            recurrence = ReminderScheduleCalculator.RECURRENCE_WEEKLY,
            daysOfWeek = listOf(DayOfWeek.WEDNESDAY.value),
            now = mondayNineAm
        )
        val nextWeeklyZdt = Instant.ofEpochMilli(nextWeekly).atZone(zone)
        assertEquals(DayOfWeek.WEDNESDAY, nextWeeklyZdt.dayOfWeek)
        assertEquals(20, nextWeeklyZdt.hour)
        assertEquals(30, nextWeeklyZdt.minute)
    }
}
