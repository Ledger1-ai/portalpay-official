package com.example.basaltsurgemobile

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import com.example.basaltsurgemobile.ui.theme.BasaltSurgeMobileTheme
import kotlinx.coroutines.launch
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import java.security.MessageDigest

/**
 * Kiosk lockdown configuration received from the web app
 */
data class LockdownConfig(
    val lockdownMode: String = "none", // "none", "standard", "device_owner"
    val unlockCodeHash: String? = null
)

class MainActivity : ComponentActivity() {
    private var runtime: GeckoRuntime? = null
    private var lockdownConfig = mutableStateOf(LockdownConfig())
    private var showUnlockOverlay = mutableStateOf(false)
    private var showUpdateDialog = mutableStateOf(false)
    private var updateInfo = mutableStateOf<OtaUpdateManager.UpdateInfo?>(null)
    private lateinit var otaUpdateManager: OtaUpdateManager
    
    companion object {
        private const val TAG = "MainActivity"
        private const val UNLOCK_SALT = "touchpoint_unlock_v1:"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize OTA Update Manager
        otaUpdateManager = OtaUpdateManager(this)
        
        runtime = GeckoRuntime.create(this)
        val session = GeckoSession()
        session.open(runtime!!)
        
        // Use BASE_DOMAIN from BuildConfig and append the setup path
        val setupUrl = "${BuildConfig.BASE_DOMAIN}/touchpoint/setup?scale=0.75"
        session.loadUri(setupUrl)
        
        // Setup back button handler for lockdown mode
        setupBackPressedHandler()
        
        // Check for OTA updates
        checkForUpdates()

        enableEdgeToEdge()
        setContent {
            BasaltSurgeMobileTheme {
                Box(modifier = Modifier.fillMaxSize()) {
                    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                        GeckoViewContainer(
                            session = session,
                            modifier = Modifier.padding(innerPadding)
                        )
                    }
                    
                    // Unlock overlay shown when user tries to exit in lockdown mode
                    if (showUnlockOverlay.value) {
                        UnlockOverlay(
                            onDismiss = { showUnlockOverlay.value = false },
                            onUnlock = { code ->
                                if (validateUnlockCode(code)) {
                                    showUnlockOverlay.value = false
                                    exitLockdownTemporarily()
                                } else {
                                    Toast.makeText(this@MainActivity, "Invalid unlock code", Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    }
                    
                    // Update available dialog
                    if (showUpdateDialog.value && updateInfo.value != null) {
                        UpdateAvailableDialog(
                            info = updateInfo.value!!,
                            onDismiss = { showUpdateDialog.value = false },
                            onUpdate = {
                                updateInfo.value?.downloadUrl?.let { url ->
                                    otaUpdateManager.downloadAndInstall(url)
                                    Toast.makeText(this@MainActivity, "Downloading update...", Toast.LENGTH_LONG).show()
                                }
                                showUpdateDialog.value = false
                            }
                        )
                    }
                }
            }
        }
        
        // Poll for lockdown config from JS bridge
        pollLockdownConfig(session)
    }
    
    private fun checkForUpdates() {
        if (!otaUpdateManager.shouldCheckForUpdate()) return
        
        lifecycleScope.launch {
            val info = otaUpdateManager.checkForUpdate()
            otaUpdateManager.recordUpdateCheck()
            
            if (info != null && info.hasUpdate) {
                Log.d(TAG, "Update available: ${info.latestVersion}")
                updateInfo.value = info
                showUpdateDialog.value = true
                
                // For Device Owner mode, auto-install if mandatory
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                if (dpm.isDeviceOwnerApp(packageName) && info.mandatory && info.downloadUrl != null) {
                    Log.d(TAG, "Auto-installing mandatory update (Device Owner mode)")
                    otaUpdateManager.downloadAndInstall(info.downloadUrl)
                }
            }
        }
    }
    
    private fun setupBackPressedHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val mode = lockdownConfig.value.lockdownMode
                if (mode == "standard" || mode == "device_owner") {
                    // Block back button and show unlock overlay
                    Log.d(TAG, "Back pressed blocked - lockdown mode: $mode")
                    showUnlockOverlay.value = true
                } else {
                    // Allow normal back behavior
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })
    }
    
    private fun pollLockdownConfig(session: GeckoSession) {
        // Poll every 2 seconds to check for config from JS bridge
        // GeckoView doesn't have evaluateJavascript, so we use loadUri with JavaScript protocol
        val handler = android.os.Handler(mainLooper)
        val runnable = object : Runnable {
            override fun run() {
                // Inject JS that will store the config in a global variable we can access via URL scheme
                val jsCode = """
                    (function() {
                        if (window.TOUCHPOINT_CONFIG) {
                            var cfg = window.TOUCHPOINT_CONFIG;
                            var lockdownMode = cfg.lockdownMode || 'none';
                            var unlockCodeHash = cfg.unlockCodeHash || '';
                            // Post message to Android - we'll detect this via NavigationDelegate
                            window.location.hash = 'android-config:' + lockdownMode + ':' + (unlockCodeHash || 'null');
                            // Reset hash after a short delay
                            setTimeout(function() { 
                                if (window.location.hash.indexOf('android-config') === 1) {
                                    window.location.hash = '';
                                }
                            }, 100);
                        }
                    })();
                """.trimIndent().replace("\n", " ")
                
                try {
                    session.loadUri("javascript:$jsCode")
                } catch (e: Exception) {
                    Log.e(TAG, "Error executing JS bridge: ${e.message}")
                }
                
                handler.postDelayed(this, 2000)
            }
        }
        handler.postDelayed(runnable, 1000)
        
        // Set up URL change listener to capture config from hash
        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(session: GeckoSession, url: String?, perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>, hasUserGesture: Boolean) {
                url?.let { currentUrl ->
                    if (currentUrl.contains("#android-config:")) {
                        try {
                            val hash = currentUrl.substringAfter("#android-config:")
                            val parts = hash.split(":")
                            if (parts.size >= 2) {
                                val mode = parts[0]
                                val hashValue = if (parts[1] == "null") null else parts[1]
                                
                                val newConfig = LockdownConfig(mode, hashValue)
                                if (newConfig != lockdownConfig.value) {
                                    Log.d(TAG, "Lockdown config updated via URL: $newConfig")
                                    lockdownConfig.value = newConfig
                                    
                                    if (mode == "standard" || mode == "device_owner") {
                                        enableLockTaskMode()
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error parsing lockdown config from URL: ${e.message}")
                        }
                    }
                }
            }
        }
    }
    
    private fun extractJsonField(json: String, field: String): String? {
        val regex = """"$field"\s*:\s*"?([^",}]+)"?""".toRegex()
        return regex.find(json)?.groupValues?.getOrNull(1)?.takeIf { it != "null" }
    }
    
    private fun enableLockTaskMode() {
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            if (!am.isInLockTaskMode) {
                // Check if we're device owner for full lockdown
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val componentName = ComponentName(this, AppDeviceAdminReceiver::class.java)
                
                if (dpm.isDeviceOwnerApp(packageName)) {
                    // Device Owner mode - full lockdown
                    dpm.setLockTaskPackages(componentName, arrayOf(packageName))
                    startLockTask()
                    Log.d(TAG, "Started Lock Task Mode (Device Owner)")
                } else if (lockdownConfig.value.lockdownMode == "standard") {
                    // Standard mode - just start lock task without device owner
                    // This provides partial lockdown (user can still exit with difficulty)
                    startLockTask()
                    Log.d(TAG, "Started Lock Task Mode (Standard)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start Lock Task Mode: ${e.message}")
        }
    }
    
    private fun validateUnlockCode(enteredCode: String): Boolean {
        val storedHash = lockdownConfig.value.unlockCodeHash ?: return false
        
        // Hash the entered code using the same method as the backend
        val digest = MessageDigest.getInstance("SHA-256")
        val hashedBytes = digest.digest((UNLOCK_SALT + enteredCode).toByteArray())
        val enteredHash = hashedBytes.joinToString("") { "%02x".format(it) }
        
        return enteredHash == storedHash
    }
    
    private fun exitLockdownTemporarily() {
        try {
            stopLockTask()
            Toast.makeText(this, "Lockdown disabled temporarily", Toast.LENGTH_SHORT).show()
            Log.d(TAG, "Lock Task Mode stopped temporarily")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop Lock Task Mode: ${e.message}")
        }
    }
    
    override fun onPause() {
        super.onPause()
        // If in lockdown mode, don't allow the activity to be paused
        val mode = lockdownConfig.value.lockdownMode
        if (mode == "standard" || mode == "device_owner") {
            // Re-open the activity immediately if paused
            val intent = intent
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            startActivity(intent)
        }
    }
}

@Composable
fun GeckoViewContainer(session: GeckoSession, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { context ->
            GeckoView(context).apply {
                setSession(session)
            }
        },
        modifier = modifier.fillMaxSize()
    )
}

@Composable
fun UnlockOverlay(
    onDismiss: () -> Unit,
    onUnlock: (String) -> Unit
) {
    var code by remember { mutableStateOf("") }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.9f)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A))
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "🔒",
                    fontSize = 48.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                
                Text(
                    text = "Device Locked",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                Text(
                    text = "Enter unlock code to exit",
                    fontSize = 14.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = 24.dp)
                )
                
                OutlinedTextField(
                    value = code,
                    onValueChange = { if (it.length <= 8 && it.all { c -> c.isDigit() }) code = it },
                    label = { Text("Unlock Code") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    keyboardActions = KeyboardActions(onDone = { onUnlock(code) }),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF10B981),
                        unfocusedBorderColor = Color.Gray
                    )
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Gray)
                    ) {
                        Text("Cancel")
                    }
                    
                    Button(
                        onClick = { onUnlock(code) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        enabled = code.length >= 4
                    ) {
                        Text("Unlock")
                    }
                }
            }
        }
    }
}

@Composable
fun UpdateAvailableDialog(
    info: OtaUpdateManager.UpdateInfo,
    onDismiss: () -> Unit,
    onUpdate: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.8f)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A))
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "🔄",
                    fontSize = 48.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                
                Text(
                    text = "Update Available",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                Text(
                    text = "Version ${info.latestVersion}",
                    fontSize = 16.sp,
                    color = Color(0xFF10B981),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                if (info.releaseNotes.isNotEmpty()) {
                    Text(
                        text = info.releaseNotes,
                        fontSize = 14.sp,
                        color = Color.Gray,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                }
                
                if (info.mandatory) {
                    Text(
                        text = "⚠️ This update is required",
                        fontSize = 12.sp,
                        color = Color(0xFFEF4444),
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (!info.mandatory) {
                        OutlinedButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Gray)
                        ) {
                            Text("Later")
                        }
                    }
                    
                    Button(
                        onClick = onUpdate,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Text("Install Update")
                    }
                }
            }
        }
    }
}
