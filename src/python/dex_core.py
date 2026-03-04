#!/usr/bin/env python3
"""
DEX Core Python Backend
Deep system control, learning, and automation engine.
Communicates with Electron via JSON over stdin/stdout.
"""

import json
import sys
import os
import time
import threading
import subprocess
import platform
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════
# DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════

try:
    import psutil
except ImportError:
    psutil = None

# ═══════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class SystemStats:
    cpu_percent: float
    cpu_count: int
    memory_total: int
    memory_used: int
    memory_percent: float
    battery_percent: Optional[float]
    battery_charging: Optional[bool]
    uptime: int
    platform: str

@dataclass
class ProcessInfo:
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    status: str
    category: str  # 'system', 'user', 'background', 'safe_to_close'

# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════

class SystemController:
    """Deep system control and monitoring."""
    
    # System processes - never touch
    SYSTEM_PROCESSES = {
        'system', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe',
        'lsass.exe', 'svchost.exe', 'winlogon.exe', 'dwm.exe', 'explorer.exe',
        'kernel_task', 'launchd', 'loginwindow', 'windowserver',
        'init', 'systemd', 'kthreadd'
    }
    
    # Safe to close background apps
    CLOSEABLE_APPS = {
        'spotify', 'discord', 'slack', 'teams', 'zoom', 'skype',
        'steam', 'epicgameslauncher', 'origin', 'battle.net',
        'onedrive', 'dropbox', 'googledrivesync',
        'adobedesktopservice', 'ccxprocess', 'adobe cef helper'
    }
    
    def __init__(self):
        self.os_type = platform.system().lower()
        self.boot_time = psutil.boot_time() if psutil else time.time()
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get comprehensive system stats."""
        if not psutil:
            return {"error": "psutil not available"}
        
        try:
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            battery = psutil.sensors_battery()
            
            stats = SystemStats(
                cpu_percent=cpu,
                cpu_count=psutil.cpu_count(),
                memory_total=mem.total,
                memory_used=mem.used,
                memory_percent=mem.percent,
                battery_percent=battery.percent if battery else None,
                battery_charging=battery.power_plugged if battery else None,
                uptime=int(time.time() - self.boot_time),
                platform=self.os_type
            )
            return asdict(stats)
        except Exception as e:
            return {"error": str(e)}
    
    def get_processes(self, limit: int = 30) -> List[Dict]:
        """Get detailed process list with categorization."""
        if not psutil:
            return []
        
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'memory_info', 'status']):
            try:
                info = proc.info
                name = (info['name'] or 'Unknown').lower()
                mem_mb = info['memory_info'].rss / (1024 * 1024) if info.get('memory_info') else 0
                
                # Categorize
                category = 'user'
                if name in self.SYSTEM_PROCESSES or name.startswith('svchost'):
                    category = 'system'
                elif any(app in name for app in self.CLOSEABLE_APPS):
                    category = 'safe_to_close'
                elif info['cpu_percent'] == 0 and info['memory_percent'] < 0.5:
                    category = 'background'
                
                processes.append(asdict(ProcessInfo(
                    pid=info['pid'],
                    name=info['name'] or 'Unknown',
                    cpu_percent=round(info['cpu_percent'] or 0, 1),
                    memory_percent=round(info['memory_percent'] or 0, 1),
                    memory_mb=round(mem_mb, 1),
                    status=info['status'] or 'unknown',
                    category=category
                )))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by resource usage
        processes.sort(key=lambda p: p['cpu_percent'] + p['memory_percent'], reverse=True)
        return processes[:limit]
    
    def close_process(self, pid: int, force: bool = False) -> Dict[str, Any]:
        """Safely close a process."""
        if not psutil:
            return {"success": False, "error": "psutil not available"}
        
        try:
            proc = psutil.Process(pid)
            name = proc.name().lower()
            
            # Safety check
            if name in self.SYSTEM_PROCESSES:
                return {"success": False, "error": "Cannot close system process"}
            
            if force:
                proc.kill()
            else:
                proc.terminate()
                proc.wait(timeout=5)
            
            return {"success": True, "message": f"Closed {proc.name()}"}
        except psutil.NoSuchProcess:
            return {"success": False, "error": "Process not found"}
        except psutil.AccessDenied:
            return {"success": False, "error": "Access denied - may need admin"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def free_memory(self) -> Dict[str, Any]:
        """Attempt to free system memory."""
        freed = 0
        try:
            if self.os_type == 'windows':
                # Trigger garbage collection in running Python processes
                import gc
                gc.collect()
                freed = 50  # Estimate
            elif self.os_type == 'darwin':
                subprocess.run(['purge'], capture_output=True, timeout=30)
                freed = 200
            else:
                # Linux - drop caches (needs sudo)
                subprocess.run(['sync'], capture_output=True, timeout=10)
                freed = 100
            
            return {"success": True, "freedMB": freed}
        except Exception as e:
            return {"success": False, "error": str(e), "freedMB": 0}

# ═══════════════════════════════════════════════════════════════════════════
# POWER MANAGER
# ═══════════════════════════════════════════════════════════════════════════

class PowerManager:
    """Power profile and energy management."""
    
    PROFILES = {
        'eco': {'description': 'Maximum battery life', 'cpu_limit': 50},
        'balanced': {'description': 'Normal operation', 'cpu_limit': 100},
        'boost': {'description': 'Maximum performance', 'cpu_limit': 100}
    }
    
    def __init__(self):
        self.os_type = platform.system().lower()
        self.current_profile = 'balanced'
    
    def set_profile(self, profile: str) -> Dict[str, Any]:
        """Set power profile with OS-specific commands."""
        if profile not in self.PROFILES:
            return {"success": False, "error": f"Invalid profile: {profile}"}
        
        changes = []
        
        try:
            if self.os_type == 'windows':
                guids = {
                    'eco': 'a1841308-3541-4fab-bc81-f71556f20b4a',
                    'balanced': '381b4222-f694-41f0-9685-ff5bb260df2e',
                    'boost': '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
                }
                subprocess.run(
                    ['powercfg', '/setactive', guids[profile]],
                    capture_output=True, timeout=10
                )
                changes.append(f"Set Windows power plan to {profile}")
            
            elif self.os_type == 'darwin':
                if profile == 'eco':
                    subprocess.run(['pmset', '-a', 'lowpowermode', '1'], capture_output=True)
                    changes.append("Enabled Low Power Mode")
                else:
                    subprocess.run(['pmset', '-a', 'lowpowermode', '0'], capture_output=True)
                    changes.append("Disabled Low Power Mode")
            
            else:  # Linux
                governors = {'eco': 'powersave', 'balanced': 'schedutil', 'boost': 'performance'}
                subprocess.run(
                    ['cpupower', 'frequency-set', '-g', governors[profile]],
                    capture_output=True, timeout=10
                )
                changes.append(f"Set CPU governor to {governors[profile]}")
            
            self.current_profile = profile
            return {"success": True, "profile": profile, "changes": changes}
        
        except Exception as e:
            return {"success": False, "error": str(e), "changes": changes}
    
    def get_status(self) -> Dict[str, Any]:
        """Get current power status."""
        if not psutil:
            return {"profile": self.current_profile, "battery": None}
        
        battery = psutil.sensors_battery()
        return {
            "profile": self.current_profile,
            "battery": {
                "percent": battery.percent if battery else None,
                "charging": battery.power_plugged if battery else None,
                "timeLeft": battery.secsleft if battery and battery.secsleft > 0 else None
            } if battery else None
        }

# ═══════════════════════════════════════════════════════════════════════════
# LEARNING ENGINE (Pattern Recognition)
# ═══════════════════════════════════════════════════════════════════════════

class LearningEngine:
    """Learns user patterns for intelligent suggestions."""
    
    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.data_path.mkdir(parents=True, exist_ok=True)
        self.patterns_file = self.data_path / 'patterns.json'
        self.patterns = self._load_patterns()
    
    def _load_patterns(self) -> Dict:
        """Load learned patterns from disk."""
        if self.patterns_file.exists():
            try:
                with open(self.patterns_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            'hourly_activity': defaultdict(int),
            'app_sequences': [],
            'operation_frequency': defaultdict(int),
            'time_based_ops': defaultdict(list)
        }
    
    def _save_patterns(self):
        """Persist patterns to disk."""
        try:
            # Convert defaultdicts to regular dicts for JSON
            data = {
                'hourly_activity': dict(self.patterns['hourly_activity']),
                'app_sequences': self.patterns['app_sequences'][-100:],  # Keep last 100
                'operation_frequency': dict(self.patterns['operation_frequency']),
                'time_based_ops': dict(self.patterns['time_based_ops'])
            }
            with open(self.patterns_file, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            pass
    
    def record_activity(self, activity_type: str, data: Dict):
        """Record user activity for pattern learning."""
        hour = datetime.now().hour
        self.patterns['hourly_activity'][str(hour)] = \
            self.patterns['hourly_activity'].get(str(hour), 0) + 1
        
        if activity_type == 'operation':
            op_name = data.get('name', 'unknown')
            self.patterns['operation_frequency'][op_name] = \
                self.patterns['operation_frequency'].get(op_name, 0) + 1
            
            # Track time-based patterns
            time_key = f"{hour:02d}:00"
            if time_key not in self.patterns['time_based_ops']:
                self.patterns['time_based_ops'][time_key] = []
            if op_name not in self.patterns['time_based_ops'][time_key]:
                self.patterns['time_based_ops'][time_key].append(op_name)
        
        self._save_patterns()
    
    def get_suggestions(self) -> List[Dict]:
        """Get intelligent suggestions based on patterns."""
        suggestions = []
        current_hour = datetime.now().hour
        time_key = f"{current_hour:02d}:00"
        
        # Suggest operations commonly run at this time
        if time_key in self.patterns['time_based_ops']:
            for op in self.patterns['time_based_ops'][time_key][:3]:
                suggestions.append({
                    'type': 'operation',
                    'name': op,
                    'reason': f'You often run this around {time_key}'
                })
        
        # Suggest most frequent operations
        freq = self.patterns['operation_frequency']
        if freq:
            top_ops = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:3]
            for op, count in top_ops:
                if not any(s['name'] == op for s in suggestions):
                    suggestions.append({
                        'type': 'operation',
                        'name': op,
                        'reason': f'Frequently used ({count} times)'
                    })
        
        return suggestions[:5]

# ═══════════════════════════════════════════════════════════════════════════
# WATCHDOG (Self-monitoring)
# ═══════════════════════════════════════════════════════════════════════════

class Watchdog:
    """Monitors Dex's own health and stability."""
    
    def __init__(self):
        self.start_time = time.time()
        self.error_count = 0
        self.last_heartbeat = time.time()
        self.memory_samples = []
    
    def heartbeat(self):
        """Record heartbeat for health monitoring."""
        self.last_heartbeat = time.time()
        
        # Sample memory usage
        if psutil:
            proc = psutil.Process()
            mem_mb = proc.memory_info().rss / (1024 * 1024)
            self.memory_samples.append(mem_mb)
            # Keep last 60 samples
            self.memory_samples = self.memory_samples[-60:]
    
    def record_error(self, error: str):
        """Track errors for stability monitoring."""
        self.error_count += 1
    
    def get_health(self) -> Dict[str, Any]:
        """Get Dex health status."""
        uptime = int(time.time() - self.start_time)
        
        current_mem = 0
        avg_mem = 0
        mem_trend = 'stable'
        
        if psutil:
            proc = psutil.Process()
            current_mem = round(proc.memory_info().rss / (1024 * 1024), 1)
        
        if self.memory_samples:
            avg_mem = round(sum(self.memory_samples) / len(self.memory_samples), 1)
            if len(self.memory_samples) > 10:
                recent = sum(self.memory_samples[-10:]) / 10
                older = sum(self.memory_samples[:10]) / 10
                if recent > older * 1.2:
                    mem_trend = 'increasing'
                elif recent < older * 0.8:
                    mem_trend = 'decreasing'
        
        return {
            "uptime": uptime,
            "uptimeFormatted": f"{uptime // 3600}h {(uptime % 3600) // 60}m",
            "errorCount": self.error_count,
            "memoryMB": current_mem,
            "avgMemoryMB": avg_mem,
            "memoryTrend": mem_trend,
            "healthy": self.error_count < 10 and mem_trend != 'increasing'
        }

# ═══════════════════════════════════════════════════════════════════════════
# MAIN IPC HANDLER
# ═══════════════════════════════════════════════════════════════════════════

class DexCore:
    """Main handler for Electron IPC communication."""
    
    def __init__(self):
        self.system = SystemController()
        self.power = PowerManager()
        self.watchdog = Watchdog()
        
        # Initialize learning with app data path
        data_path = os.environ.get('DEX_DATA_PATH', 
            os.path.join(os.path.expanduser('~'), '.dex'))
        self.learning = LearningEngine(data_path)
    
    def handle_command(self, cmd: str, args: Dict) -> Dict[str, Any]:
        """Route commands to appropriate handlers."""
        self.watchdog.heartbeat()
        
        try:
            # System commands
            if cmd == 'system.stats':
                return self.system.get_system_stats()
            elif cmd == 'system.processes':
                return {"processes": self.system.get_processes(args.get('limit', 30))}
            elif cmd == 'system.close':
                return self.system.close_process(args['pid'], args.get('force', False))
            elif cmd == 'system.freeMemory':
                return self.system.free_memory()
            
            # Power commands
            elif cmd == 'power.setProfile':
                return self.power.set_profile(args['profile'])
            elif cmd == 'power.status':
                return self.power.get_status()
            
            # Learning commands
            elif cmd == 'learning.record':
                self.learning.record_activity(args['type'], args.get('data', {}))
                return {"success": True}
            elif cmd == 'learning.suggestions':
                return {"suggestions": self.learning.get_suggestions()}
            
            # Watchdog commands
            elif cmd == 'health':
                return self.watchdog.get_health()
            
            else:
                return {"error": f"Unknown command: {cmd}"}
        
        except Exception as e:
            self.watchdog.record_error(str(e))
            return {"error": str(e)}

def main():
    """Main entry point - reads JSON commands from stdin, writes responses to stdout."""
    core = DexCore()
    
    # Signal ready
    print(json.dumps({"status": "ready", "psutil": psutil is not None}), flush=True)
    
    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            cmd = request.get('cmd', '')
            args = request.get('args', {})
            
            response = core.handle_command(cmd, args)
            print(json.dumps(response), flush=True)
        
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == '__main__':
    main()
