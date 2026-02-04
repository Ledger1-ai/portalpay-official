package com.example.basaltsurgemobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BootReceiver - Auto-launches the app when the device boots up.
 * This is essential for kiosk/terminal mode to ensure the payment app
 * is always running after device restarts.
 * 
 * On Android 10+, we use BootService (ForegroundService) to reliably
 * start the activity from background.
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "BootReceiver triggered with action: $action")
        
        // Handle both standard boot and quick boot (some manufacturers use this)
        if (action == Intent.ACTION_BOOT_COMPLETED || 
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON") {
            
            Log.d(TAG, "Boot completed, launching app...")
            
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Android 8+ requires foreground service
                    Log.d(TAG, "Starting BootService (foreground)")
                    val serviceIntent = Intent(context, BootService::class.java)
                    context.startForegroundService(serviceIntent)
                } else {
                    // Older Android can start activity directly
                    Log.d(TAG, "Starting MainActivity directly")
                    val launchIntent = Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                    context.startActivity(launchIntent)
                }
                
                Log.d(TAG, "Launch command sent successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch app on boot: ${e.message}", e)
            }
        } else {
            Log.d(TAG, "Ignoring unrelated action: $action")
        }
    }
}
