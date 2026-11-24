package com.omarai.assistant.tools

import java.time.DayOfWeek
import java.time.ZonedDateTime

object ReminderScheduleCalculator {

    const val RECURRENCE_ONCE = "once"
    const val RECURRENCE_DAILY = "daily"
    const val RECURRENCE_WEEKLY = "weekly"
    const val RECURRENCE_MONTHLY = "monthly"

    fun normalizeRecurrence(raw: String?): String {
        return when (raw?.trim()?.lowercase()) {
            RECURRENCE_DAILY -> RECURRENCE_DAILY
            RECURRENCE_WEEKLY -> RECURRENCE_WEEKLY
            RECURRENCE_MONTHLY -> RECURRENCE_MONTHLY
            else -> RECURRENCE_ONCE
        }
    }

    fun parseTime24(raw: String?): Pair<Int, Int>? {
        val clean = raw?.trim() ?: return null
        val parts = clean.split(":")
        if (parts.size != 2) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) return null
        return hour to minute
    }

    fun formatTime24(hour: Int, minute: Int): String {
        val h = hour.coerceIn(0, 23)
        val m = minute.coerceIn(0, 59)
        return "%02d:%02d".format(h, m)
    }

    fun formatTimeArabic12(hour: Int, minute: Int): String {
        val h = hour.coerceIn(0, 23)
        val m = minute.coerceIn(0, 59)
        val period = if (h >= 12) "م" else "ص"
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "$h12:${"%02d".format(m)} $period"
    }

    fun parseDaysCsv(csv: String): List<Int> {
        return csv.split(",")
            .mapNotNull { it.trim().toIntOrNull() }
            .filter { it in 1..7 }
            .distinct()
            .sorted()
    }

    fun daysToCsv(days: List<Int>?): String {
        return days.orEmpty()
            .filter { it in 1..7 }
            .distinct()
            .sorted()
            .joinToString(",")
    }

    /**
     * Computes the exact next trigger timestamp in epoch milliseconds.
     * Always returns a timestamp strictly after [now].
     */
    fun computeNextTriggerMillis(
        hour: Int,
        minute: Int,
        recurrence: String,
        daysOfWeek: List<Int> = emptyList(),
        now: ZonedDateTime = ZonedDateTime.now()
    ): Long {
        val safeHour = hour.coerceIn(0, 23)
        val safeMinute = minute.coerceIn(0, 59)
        val normalized = normalizeRecurrence(recurrence)

        val candidateToday = now
            .withHour(safeHour)
            .withMinute(safeMinute)
            .withSecond(0)
            .withNano(0)

        return when (normalized) {
            RECURRENCE_ONCE, RECURRENCE_DAILY -> {
                val target = if (candidateToday.isAfter(now)) {
                    candidateToday
                } else {
                    candidateToday.plusDays(1)
                }
                target.toInstant().toEpochMilli()
            }

            RECURRENCE_WEEKLY -> {
                val validDays = daysOfWeek.filter { it in 1..7 }.distinct()
                val targetDays = if (validDays.isEmpty()) {
                    listOf(now.dayOfWeek.value)
                } else {
                    validDays
                }

                for (offset in 0L..7L) {
                    val candidate = candidateToday.plusDays(offset)
                    if (candidate.dayOfWeek.value in targetDays && candidate.isAfter(now)) {
                        return candidate.toInstant().toEpochMilli()
                    }
                }
                candidateToday.plusWeeks(1).toInstant().toEpochMilli()
            }

            RECURRENCE_MONTHLY -> {
                if (candidateToday.isAfter(now)) {
                    candidateToday.toInstant().toEpochMilli()
                } else {
                    val nextMonth = candidateToday.plusMonths(1)
                    nextMonth.toInstant().toEpochMilli()
                }
            }

            else -> {
                val target = if (candidateToday.isAfter(now)) candidateToday else candidateToday.plusDays(1)
                target.toInstant().toEpochMilli()
            }
        }
    }

    fun formatRecurrenceLabelArabic(recurrence: String, daysOfWeek: List<Int>): String {
        return when (normalizeRecurrence(recurrence)) {
            RECURRENCE_DAILY -> "كل يوم"
            RECURRENCE_WEEKLY -> {
                val names = daysOfWeek.filter { it in 1..7 }.distinct().map { dayArabicName(it) }
                if (names.isEmpty()) "أسبوعياً" else "كل ${names.joinToString("، ")}"
            }
            RECURRENCE_MONTHLY -> "شهرياً"
            else -> "مرة واحدة"
        }
    }

    fun dayArabicName(isoDay: Int): String = when (isoDay) {
        DayOfWeek.SATURDAY.value -> "السبت"
        DayOfWeek.SUNDAY.value -> "الأحد"
        DayOfWeek.MONDAY.value -> "الإثنين"
        DayOfWeek.TUESDAY.value -> "الثلاثاء"
        DayOfWeek.WEDNESDAY.value -> "الأربعاء"
        DayOfWeek.THURSDAY.value -> "الخميس"
        DayOfWeek.FRIDAY.value -> "الجمعة"
        else -> ""
    }
}
