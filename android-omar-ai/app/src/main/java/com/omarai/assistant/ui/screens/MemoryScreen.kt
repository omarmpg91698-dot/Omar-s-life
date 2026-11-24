package com.omarai.assistant.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.omarai.assistant.data.local.MemoryEntity
import com.omarai.assistant.ui.viewmodel.AssistantViewModel

private val MEMORY_CATEGORIES = listOf("شخصي", "شغل", "روتين", "تفضيلات", "علاقات", "صحة")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryScreen(
    viewModel: AssistantViewModel,
    onBack: () -> Unit
) {
    val memories by viewModel.memories.collectAsState()
    val prefs by viewModel.preferences.collectAsState()

    var selectedCategory by remember { mutableStateOf("الكل") }
    var newCategory by remember { mutableStateOf("شخصي") }
    var newFact by remember { mutableStateOf("") }
    var privateBio by remember(prefs.privateBioEncrypted) { mutableStateOf(prefs.privateBioEncrypted) }
    var editingMemory by remember { mutableStateOf<MemoryEntity?>(null) }
    var editFactText by remember { mutableStateOf("") }

    val filtered = remember(memories, selectedCategory) {
        if (selectedCategory == "الكل") memories
        else memories.filter { it.category == selectedCategory }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ذاكرة Omar's personal assistant") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "رجوع")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            text = "نبذة مشفّرة عن حياتك (تُحفظ محلياً بتشفير Android Keystore)",
                            style = MaterialTheme.typography.titleMedium
                        )
                        OutlinedTextField(
                            value = privateBio,
                            onValueChange = { privateBio = it },
                            placeholder = { Text("مثلاً: شغلي، روتين يومي، مواعيد نومي، الحاجات اللي بحبها...") },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Button(
                            onClick = { viewModel.updatePrivateBio(privateBio) },
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("حفظ النبذة المشفّرة")
                        }
                    }
                }
            }

            item {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("أضف معلومة جديدة للذاكرة", style = MaterialTheme.typography.titleMedium)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(MEMORY_CATEGORIES) { cat ->
                                FilterChip(
                                    selected = newCategory == cat,
                                    onClick = { newCategory = cat },
                                    label = { Text(cat) }
                                )
                            }
                        }
                        OutlinedTextField(
                            value = newFact,
                            onValueChange = { newFact = it },
                            placeholder = { Text("مثلاً: بفضل الشغل بدري وبروح الجيم الساعة ٧ مساءً") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Button(
                            onClick = {
                                viewModel.addMemory(newCategory, newFact)
                                newFact = ""
                            },
                            enabled = newFact.isNotBlank(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Rounded.Add, contentDescription = null)
                            Text("حفظ في الذاكرة")
                        }
                    }
                }
            }

            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf("الكل") + MEMORY_CATEGORIES) { cat ->
                        FilterChip(
                            selected = selectedCategory == cat,
                            onClick = { selectedCategory = cat },
                            label = { Text(cat) }
                        )
                    }
                }
            }

            if (filtered.isEmpty()) {
                item {
                    Text(
                        text = "مفيش معلومات محفوظة في القسم ده لسه. أي معلومة مهمة بتوافق عليها بتظهر هنا وتقدر تعدلها أو تمسحها في أي وقت.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                }
            } else {
                items(filtered, key = { it.id }) { item ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.category,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(text = item.fact, style = MaterialTheme.typography.bodyMedium)
                            }
                            IconButton(
                                onClick = {
                                    editingMemory = item
                                    editFactText = item.fact
                                }
                            ) {
                                Icon(Icons.Rounded.Edit, contentDescription = "تعديل")
                            }
                            IconButton(onClick = { viewModel.deleteMemory(item.id) }) {
                                Icon(
                                    Icons.Rounded.Delete,
                                    contentDescription = "حذف",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    val toEdit = editingMemory
    if (toEdit != null) {
        AlertDialog(
            onDismissRequest = { editingMemory = null },
            title = { Text("تعديل المعلومة") },
            text = {
                OutlinedTextField(
                    value = editFactText,
                    onValueChange = { editFactText = it },
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.updateMemory(toEdit, toEdit.category, editFactText)
                        editingMemory = null
                    }
                ) {
                    Text("حفظ")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingMemory = null }) {
                    Text("إلغاء")
                }
            }
        )
    }
}
