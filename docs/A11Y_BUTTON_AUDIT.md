# Accessibility Audit: Buttons Missing `aria-label` or `title`

**Generated**: Automated scan of all `<button>` elements missing `aria-label` or `title` attributes.  
**Scope**: `src/renderer/pages/`, `src/renderer/DEXAPPLICATIONS/`, `src/renderer/components/`, `src/renderer/App.tsx`  
**App.tsx**: 0 buttons found — no issues.

---

## Executive Summary

| Category | Files | Total Buttons | Missing a11y | % Missing |
|---|---|---|---|---|
| DEXAPPLICATIONS | 12 | 394 | 340 | 86% |
| Pages | 13 | 147 | 115 | 78% |
| Components | 119 | ~530 | ~380 | ~72% |
| **TOTAL** | **144** | **~1,071** | **~835** | **~78%** |

---

## PART 1: DEXAPPLICATIONS (sorted by missing count)

---

### Imosion.tsx — 73/92 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L1400 | `aria-label="Mute track"` | Track mute toggle (M) |
| L1401 | `aria-label="Solo track"` | Track solo toggle (S) |
| L1402 | `aria-label="Arm track for recording"` | Track arm toggle (R) |
| L3085 | `aria-label="File menu"` | File menu dropdown |
| L3102 | `aria-label="Arrange view"` | View mode: Arrange |
| L3103 | `aria-label="Mixer view"` | View mode: Mixer |
| L3171 | `aria-label="Export project"` | Export button |
| L3236 | `aria-label="Split clip"` | Clip split tool |
| L3239 | `aria-label="Import audio"` | Import media |
| L3240 | `aria-label="Export audio"` | Export button |
| L3242 | `aria-label="Add FX bus"` | FX Bus add |
| L3243 | `aria-label="Add group bus"` | Group bus add |
| L3245 | `aria-label="Open plugin store"` | Plugin store |
| L3246 | `aria-label="Add effect plugin"` | Add FX |
| L3314 | `aria-label="Add new track"` | Add track (empty state) |
| L3317 | `aria-label="Import audio file"` | Import file |
| L3429 | `aria-label="Add track"` | Add track |
| L3430 | `aria-label="Add FX bus"` | FX Bus |
| L3454 | `aria-label="Add track"` | Add track (empty) |
| L3495 | `aria-label="Mute track"` | Track mute (M) |
| L3496 | `aria-label="Solo track"` | Track solo (S) |
| L3497 | `aria-label="Arm track for recording"` | Track arm (R) |
| L3552 | `aria-label="Mute bus"` | Bus mute (M) |
| L3553 | `aria-label="Solo bus"` | Bus solo (S) |
| L3554 | `aria-label="Delete bus"` | Bus delete |
| L3579 | `aria-label="Toggle limiter"` | Limiter ON/OFF |
| L3585 | `aria-label="Open mastering panel"` | Mastering |
| L3603 | `aria-label="Close mastering panel"` | Close mastering |
| L3610 | `aria-label="Save current preset"` | Save preset |
| L3618 | `aria-label="Apply mastering preset"` | Mastering preset |
| L3619 | `aria-label="Delete mastering preset"` | Delete preset |
| L3670 | `aria-label="Toggle limiter"` | Limiter toggle |
| L3688 | `aria-label="Reset mastering settings"` | Reset |
| L3689 | `aria-label="Close mastering panel"` | Done |
| L3708 | `aria-label="Cancel save preset"` | Cancel |
| L3709 | `aria-label="Save preset"` | Save |
| L3737 | `aria-label="Toggle phase invert"` | Phase toggle |
| L3751 | `aria-label="Toggle pre/post fader"` | Pre/Post toggle |
| L3752 | `aria-label="Remove send"` | Remove send |
| L3776 | `aria-label="Toggle plugin"` | Plugin ON |
| L3780 | `aria-label="Remove plugin"` | Remove plugin |
| L3850 | `aria-label="Close plugin browser"` | Close |
| L3855 | `aria-label="Built-in effects tab"` | Effects tab |
| L3856 | `aria-label="Installed plugins tab"` | Installed tab |
| L3908 | `aria-label="Close plugin store"` | Close store |
| L3923 | `aria-label="Browse plugins tab"` | Browse tab |
| L3924 | `aria-label="Installed plugins tab"` | Installed tab |
| L3940 | `aria-label="Install plugin"` | Install |
| L3971 | `aria-label="Uninstall plugin"` | Uninstall |
| L3993 | `aria-label="Close templates"` | Close templates |
| L3998 | `aria-label="Save template"` | Save |
| L4007 | `aria-label="Delete template"` | Delete |
| L4069 | `aria-label="Close clip editor"` | Close clip editor |
| L4081 | `aria-label="Detect clip key"` | Detect key |
| L4087 | `aria-label="Lock/unlock clip key"` | Key lock toggle |
| L4135 | `aria-label="Match/unmatch clip tempo"` | Tempo lock toggle |
| L4177 | `aria-label="Set warp mode"` | Warp mode select |
| L4223 | `aria-label="Set clip speed"` | Speed preset |
| L4261 | `aria-label="Set clip pitch"` | Pitch preset |
| L4304 | `aria-label="Toggle reverse"` | Reverse clip |
| L4305 | `aria-label="Reset clip properties"` | Reset All |
| L4307 | `aria-label="Close clip editor"` | Done |
| L4320 | `aria-label="Close export modal"` | Close export |
| L4328 | `aria-label="Select export format"` | Format select |
| L4338 | `aria-label="Select bit depth"` | Bit depth |
| L4348 | `aria-label="Select sample rate"` | Sample rate |
| L4388 | `aria-label="Export project"` | Export |
| L4402 | `aria-label="Close collaboration modal"` | Close collab |
| L4420 | `aria-label="Start collaboration session"` | Start session |
| L4432 | `aria-label="Join collaboration session"` | Join session |
| L4461 | `aria-label="Copy session ID"` | Copy |
| L4498 | `aria-label="Send message"` | Send |
| L4503 | `aria-label="Leave collaboration session"` | Leave Session |

---

### VideoEditor.tsx — 73/87 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L2681 | `aria-label="Switch workspace"` | Workspace tab |
| L2704 | `aria-label="Import media"` | Import |
| L2729 | `aria-label="Select tool"` | Tool select |
| L2759 | `aria-label="Export project"` | Export |
| L2792 | `aria-label="Switch panel"` | Panel tab |
| L2864 | `aria-label="Switch color panel"` | Lumetri panel tab |
| L2953 | `aria-label="Set audio clip type"` | Essential sound type |
| L3000 | `aria-label="Select motion graphics template"` | MOGRT select |
| L3043 | `aria-label="Add caption"` | Add caption |
| L3067 | `aria-label="Open marketplace"` | Marketplace |
| L3119 | `aria-label="Add text overlay"` | Add text |
| L3126 | `aria-label="Add animated text"` | Text animation |
| L3208 | `aria-label="Toggle playback"` | Play/Pause |
| L3279 | `aria-label="Split clip"` | Split |
| L3284 | `aria-label="Delete clip"` | Delete |
| L3334 | `aria-label="Toggle bold"` | Bold |
| L3339 | `aria-label="Toggle italic"` | Italic |
| L3360 | `aria-label="Delete text overlay"` | Delete text |
| L3400 | `aria-label="Add video track"` | Add Video track |
| L3405 | `aria-label="Add audio track"` | Add Audio track |
| L3429 | `aria-label="Toggle track mute"` | Mute track |
| L3434 | `aria-label="Toggle track lock"` | Lock track |
| L3560 | `aria-label="Toggle export queue"` | Export queue |
| L3583 | `aria-label="Select export preset"` | Export preset |
| L3677 | `aria-label="Add to export queue"` | Add to queue |
| L3682 | `aria-label="Close export modal"` | Close export |
| L3686 | `aria-label="Export project"` | Export |
| L3708 | `aria-label="Switch scope type"` | Scope type |
| L3772 | `aria-label="Disable proxy mode"` | Disable proxy |
| L3787 | `aria-label="Close mask panel"` | Close mask panel |
| L3800 | `aria-label="Select mask type"` | Mask type |
| L3821 | `aria-label="Track object"` | Track |
| L3833 | `aria-label="Track forward"` | Track Forward |
| L3838 | `aria-label="Track backward"` | Track Backward |
| L3857 | `aria-label="Close export queue"` | Close queue |
| L3892 | `aria-label="Remove from export queue"` | Remove job |
| L3910 | `aria-label="Clear export queue"` | Clear queue |
| L3943 | `aria-label="Add keyframe"` | Keyframe |
| L3987 | `aria-label="Close keyboard shortcuts"` | Close shortcuts |
| L4059 | `aria-label="Close audio mixer"` | Close mixer |
| L4083 | `aria-label="Toggle track mute"` | Mute |
| L4087 | `aria-label="Toggle track solo"` | Solo |
| L4135 | `aria-label="Close history panel"` | Close history |
| L4166 | `aria-label="Close markers panel"` | Close markers |
| L4171 | `aria-label="Add marker"` | Add marker |
| L4214 | `aria-label="Close marketplace"` | Close marketplace |
| L4276 | `aria-label="Install/uninstall plugin"` | Plugin toggle |
| L4308 | `aria-label="Close sequence settings"` | Close seq settings |
| L4391 | `aria-label="Cancel sequence settings"` | Cancel |
| L4395 | `aria-label="Apply sequence settings"` | Apply |
| L4451 | `aria-label="Close speed/duration dialog"` | Close speed |
| L4455 | `aria-label="Apply speed change"` | Apply speed |
| L4524 | `aria-label="Cancel nest sequence"` | Cancel |
| L4528 | `aria-label="Create nested sequence"` | Create nested |
| L4582 | `aria-label="Close render and replace"` | Close render |
| L4587 | `aria-label="Render and replace"` | Render |
| L4615 | `aria-label="Source monitor"` | Source |
| L4621 | `aria-label="Program monitor"` | Program |
| L4628 | `aria-label="Close source clip"` | Close source |
| L4644 | `aria-label="Set in point"` | Mark In |
| L4648 | `aria-label="Set out point"` | Mark Out |
| L4652 | `aria-label="Insert edit"` | Insert |
| L4656 | `aria-label="Overwrite edit"` | Overwrite |
| L4683 | `aria-label="Clear all LUTs"` | Clear LUTs |
| L4715 | `aria-label="Load LUT file"` | Load LUT |
| L4735 | `aria-label="Clear all effects"` | Clear effects |
| L4751 | `aria-label="Apply effect"` | Apply effect |
| L4762 | `aria-label="Load effect file"` | Load effect |
| L4778 | `aria-label="Remove active LUT"` | Remove LUT |
| L4807 | `aria-label="Menu action"` | Context menu item |
| L4844 | `aria-label="Detect scenes"` | Scene detect |
| L4872 | `aria-label="Cancel scene split"` | Cancel |
| L4876 | `aria-label="Apply scene split"` | Apply split |

---

### Rewind.tsx — 68/74 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L1093 | `aria-label="Toggle sidebar"` | Sidebar toggle |
| L1116 | `aria-label="Previous date"` | Date nav ‹ |
| L1120 | `aria-label="Next date"` | Date nav › |
| L1158 | `aria-label="Toggle section"` | Section toggle |
| L1242 | `aria-label="Execute command"` | Palette command |
| L1265 | `aria-label="Action"` | Dynamic action |
| L1327 | `aria-label="Continue setup"` | Onboarding continue |
| L1341 | `aria-label="Skip setup"` | Skip Setup |
| L1342 | `aria-label="Continue setup"` | Continue |
| L1358 | `aria-label="Toggle app exclusion"` | App toggle |
| L1376 | `aria-label="Remove app exclusion"` | Remove exclusion |
| L1386 | `aria-label="Continue setup"` | Continue |
| L1398 | `aria-label="Toggle screenshots"` | Screenshots toggle |
| L1403 | `aria-label="Toggle AI search"` | AI search toggle |
| L1408 | `aria-label="Toggle auto-delete"` | Auto-delete toggle |
| L1412 | `aria-label="Continue setup"` | Continue |
| L1424 | `aria-label="Start using Rewind"` | Start |
| L1440 | `aria-label="Close lightbox"` | Close (x) |
| L1454 | `aria-label="Close about dialog"` | Close |
| L1502 | `aria-label="Switch overview section"` | Section tab |
| L1530 | `aria-label="Search"` | Search |
| L1538 | `aria-label="Filter by type"` | Filter type |
| L1648 | `aria-label="Toggle stats"` | Expand/collapse stats |
| L1696 | `aria-label="Toggle screenshots"` | Expand/collapse shots |
| L1747 | `aria-label="Previous date"` | Prev |
| L1751 | `aria-label="Next date"` | Next |
| L1757 | `aria-label="Filter by type"` | Filter type |
| L1830 | `aria-label="Search"` | Search |
| L1903 | `aria-label="Previous date"` | Prev |
| L1905 | `aria-label="Next date"` | Next |
| L1908 | `aria-label="Generate summary"` | Generate summary |
| L2356 | `aria-label="Previous day"` | Previous Day |
| L2357 | `aria-label="Go to today"` | Today |
| L2358 | `aria-label="Next day"` | Next Day |
| L2375 | `aria-label="Previous date"` | Prev |
| L2379 | `aria-label="Next date"` | Next |
| L2465 | `aria-label="Switch analytics tab"` | Analytics tab |
| L2500 | `aria-label="Action"` | Action button |
| L2509 | `aria-label="Copy logs to clipboard"` | Copy logs |
| L2515 | `aria-label="Open logs folder"` | Open logs folder |
| L2549 | `aria-label="Action"` | Action button |
| L2758 | `aria-label="Filter journal entries"` | Journal filter |
| L2804 | `aria-label="Set mood"` | Mood emoji |
| L2834 | `aria-label="Cancel journal edit"` | Cancel edit |
| L2845 | `aria-label="Save journal entry"` | Save entry |
| L2868 | `aria-label="Link activity to journal"` | Link activity |
| L2971 | `aria-label="Pin journal entry"` | Pin entry |
| L2982 | `aria-label="Edit journal entry"` | Edit entry |
| L2993 | `aria-label="Delete journal entry"` | Delete entry |
| L3025 | `aria-label="Action"` | Button |
| L3056 | `aria-label="Toggle setting"` | Setting toggle |
| L3083 | `aria-label="Toggle screenshots"` | Screenshots toggle |
| L3118 | `aria-label="Open screenshots folder"` | Open folder |
| L3131 | `aria-label="Toggle AI search"` | AI search toggle |
| L3187 | `aria-label="Add exclusion"` | Add |
| L3193 | `aria-label="Remove exclusion"` | Remove (x) |
| L3238 | `aria-label="Select theme"` | Theme select |
| L3357 | `aria-label="Choose backup folder"` | Choose Folder |
| L3358 | `aria-label="Backup now"` | Backup Now |
| L3359 | `aria-label="Restore from backup"` | Restore |
| L3389 | `aria-label="Create workspace profile"` | Create |
| L3410 | `aria-label="Delete workspace profile"` | Delete |
| L3421 | `aria-label="Action"` | Action |
| L3430 | `aria-label="Action"` | Action |
| L3466 | `aria-label="Action"` | Action |
| L3486 | `aria-label="Action"` | Action |
| L3500 | `aria-label="Action"` | Action |
| L3556 | `aria-label="Delete all data"` | Danger: delete all |

---

### Settings.tsx (page) — 30/30 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L185 | `aria-label="Toggle setting"` | Switch toggle |
| L265 | `aria-label="Export Rewind data"` | Export data |
| L272 | `aria-label="Action"` | Dynamic button |
| L688 | `aria-label="Toggle setting"` | Setting toggle |
| L717 | `aria-label="Action"` | Dynamic button |
| L733 | `aria-label="Select accent color"` | Color picker |
| L774 | `aria-label="Action"` | Dynamic button |
| L876 | `aria-label="Reset layout"` | Reset layout |
| L1002 | `aria-label="Configure keyboard navigation"` | Configure |
| L1021 | `aria-label="Disable biometric authentication"` | Disable biometric |
| L1023 | `aria-label="Enable biometric authentication"` | Enable biometric |
| L1035 | `aria-label="Remove PIN"` | Remove PIN |
| L1037 | `aria-label="Set PIN"` | Set PIN |
| L1071 | `aria-label="Save PIN"` | Save PIN |
| L1072 | `aria-label="Cancel PIN setup"` | Cancel |
| L1084 | `aria-label="Remove password"` | Remove password |
| L1086 | `aria-label="Set password"` | Set Password |
| L1114 | `aria-label="Save password"` | Save Password |
| L1115 | `aria-label="Cancel password setup"` | Cancel |
| L1191 | `aria-label="Action"` | Dynamic button |
| L1243 | `aria-label="Action"` | Dynamic button |
| L1396 | `aria-label="Action"` | Dynamic button |
| L1422 | `aria-label="Manage security settings"` | Manage |
| L1426 | `aria-label="Manage addresses"` | Manage |
| L1430 | `aria-label="Manage payment methods"` | Manage |
| L1459 | `aria-label="Open DEX website"` | Website |
| L1460 | `aria-label="Open documentation"` | Documentation |
| L1461 | `aria-label="Report an issue"` | Report Issue |
| L1472 | `aria-label="Action"` | Dynamic button |
| L1693 | `aria-label="Navigate to section"` | Section nav |

---

### Calculator.tsx — 30/38 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L237 | `aria-label="Switch to basic mode"` | Basic mode |
| L241 | `aria-label="Switch to scientific mode"` | Scientific mode |
| L246 | `aria-label="Toggle history"` | History toggle |
| L265 | `aria-label="Sine function"` | sin |
| L266 | `aria-label="Cosine function"` | cos |
| L267 | `aria-label="Tangent function"` | tan |
| L268 | `aria-label="Natural logarithm"` | ln |
| L269 | `aria-label="Logarithm base 10"` | log |
| L271 | `aria-label="Square root"` | √ |
| L272 | `aria-label="Square"` | x² |
| L273 | `aria-label="Cube"` | x³ |
| L274 | `aria-label="Pi constant"` | π |
| L275 | `aria-label="Euler's number"` | e |
| L283 | `aria-label="Factorial"` | x! |
| L285 | `aria-label="Digit 7"` | 7 |
| L286 | `aria-label="Digit 8"` | 8 |
| L287 | `aria-label="Digit 9"` | 9 |
| L289 | `aria-label="Reciprocal"` | 1/x |
| L291 | `aria-label="Digit 4"` | 4 |
| L292 | `aria-label="Digit 5"` | 5 |
| L293 | `aria-label="Digit 6"` | 6 |
| L295 | `aria-label="Memory add"` | M+ |
| L297 | `aria-label="Digit 1"` | 1 |
| L298 | `aria-label="Digit 2"` | 2 |
| L299 | `aria-label="Digit 3"` | 3 |
| L301 | `aria-label="Memory recall"` | MR |
| L303 | `aria-label="Digit 0"` | 0 |
| L304 | `aria-label="Decimal point"` | . |
| L306 | `aria-label="Memory clear"` | MC |
| L316 | `aria-label="Clear history"` | Clear |

---

### Browser.tsx — 24/29 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L797 | `aria-label="Toggle tab menu"` | Tab menu |
| L832 | `aria-label="Close tab"` | Close tab (x) |
| L846 | `aria-label="New tab"` | New tab button |
| L863 | `aria-label="Create new tab"` | New Tab menu item |
| L866 | `aria-label="Duplicate tab"` | Duplicate Tab |
| L870 | `aria-label="Pin tab"` | Pin Tab |
| L874 | `aria-label="Close other tabs"` | Close Others |
| L877 | `aria-label="Close tabs to right"` | Close Right |
| L880 | `aria-label="Close all tabs"` | Close All |
| L908 | `aria-label="Toggle browsing history"` | History |
| L915 | `aria-label="Bookmarks"` | Bookmarks |
| L925 | `aria-label="Downloads"` | Downloads |
| L937 | `aria-label="Toggle developer tools"` | DevTools |
| L945 | `aria-label="Toggle settings"` | Settings |
| L961 | `aria-label="Clear browsing history"` | Clear All |
| L962 | `aria-label="Close history panel"` | Close |
| L997 | `aria-label="Close downloads panel"` | Close |
| L1048 | `aria-label="Previous search result"` | Find prev |
| L1056 | `aria-label="Next search result"` | Find next |
| L1064 | `aria-label="Close find bar"` | Close find |
| L1079 | `aria-label="Close settings"` | Close |
| L1150 | `aria-label="Remove bookmark"` | Remove bookmark |
| L1175 | `aria-label="Action"` | Dynamic button |
| L1186 | `aria-label="Action"` | Action button |

---

### Flux.tsx — 23/28 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L396 | `aria-label="Add shape layer"` | Add shape |
| L407 | `aria-label="Add text layer"` | Add text |
| L1316 | `aria-label="Import media"` | Import |
| L1317 | `aria-label="Open project"` | Open |
| L1318 | `aria-label="Save project"` | Save |
| L1319 | `aria-label="Export project"` | Export |
| L1345 | `aria-label="Select tool"` | Tool select |
| L1378 | `aria-label="Dismiss error"` | Close error |
| L1419 | `aria-label="Library tab"` | Library |
| L1422 | `aria-label="Presets tab"` | Presets |
| L1425 | `aria-label="Behaviors tab"` | Behaviors |
| L1428 | `aria-label="Inspector tab"` | Inspector |
| L1431 | `aria-label="History tab"` | History |
| L1442 | `aria-label="Filter presets by category"` | Preset category |
| L1671 | `aria-label="Remove behavior"` | Delete behavior |
| L1709 | `aria-label="Toggle timeline"` | Timeline toggle |
| L1713 | `aria-label="Go to start"` | Skip back |
| L1714 | `aria-label="Toggle playback"` | Play/Pause |
| L1717 | `aria-label="Go to end"` | Skip forward |
| L1726 | `aria-label="Zoom out timeline"` | Zoom out |
| L1728 | `aria-label="Zoom in timeline"` | Zoom in |
| L1732 | `aria-label="Add layer"` | Add Layer |
| L1745 | `aria-label="Toggle layer visibility"` | Layer vis |

---

### Prism.tsx — 17/25 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L412 | `aria-label="Open image"` | Open Image |
| L413 | `aria-label="New canvas"` | New Canvas |
| L1787 | `aria-label="Open image"` | Open |
| L1788 | `aria-label="Save project"` | Save |
| L1789 | `aria-label="Export image"` | Export |
| L1836 | `aria-label="Select tool"` | Tool select |
| L1873 | `aria-label="Set selection mode"` | Selection mode |
| L1896 | `aria-label="Invert selection"` | Invert |
| L1897 | `aria-label="Deselect all"` | Deselect |
| L1906 | `aria-label="Set gradient type"` | Gradient type |
| L1985 | `aria-label="Adjustments panel"` | Adjustments tab |
| L1988 | `aria-label="Presets panel"` | Presets tab |
| L1998 | `aria-label="Filter presets by category"` | Preset category |
| L2167 | `aria-label="Toggle filter"` | Filter select |
| L2180 | `aria-label="Action"` | Dynamic button |
| L2228 | `aria-label="Toggle layer visibility"` | Layer visibility |
| L2231 | `aria-label="Toggle layer lock"` | Layer lock |

---

### KanbanApp.tsx — 16/18 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L181 | `aria-label="Remove label"` | Remove label (x) |
| L189 | `aria-label="Select label color"` | Label color |
| L192 | `aria-label="Add label"` | Add |
| L200 | `aria-label="Remove checklist item"` | Remove item (x) |
| L205 | `aria-label="Add checklist item"` | Add |
| L210 | `aria-label="Delete card"` | Delete Card |
| L212 | `aria-label="Cancel"` | Cancel |
| L213 | `aria-label="Save card"` | Save |
| L389 | `aria-label="Switch board"` | Board tab |
| L393 | `aria-label="Add new board"` | Add board |
| L471 | `aria-label="Add card"` | Add |
| L472 | `aria-label="Cancel add card"` | Cancel |
| L476 | `aria-label="Add new card"` | Add card |
| L499 | `aria-label="Add column"` | Add Column |
| L500 | `aria-label="Cancel add column"` | Cancel |
| L504 | `aria-label="Add new column"` | Add column |

---

### Calendar.tsx (DEXAPP) — 12/12 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L158 | `aria-label="Go to today"` | Today |
| L160 | `aria-label="Previous month"` | Navigate prev |
| L163 | `aria-label="Next month"` | Navigate next |
| L182 | `aria-label="Month view"` | Month |
| L183 | `aria-label="Week view"` | Week |
| L185 | `aria-label="Add event"` | Add event |
| L243 | `aria-label="Delete event"` | Delete (×) |
| L255 | `aria-label="Toggle sidebar"` | Sidebar toggle |
| L381 | `aria-label="Close event modal"` | Close (×) |
| L409 | `aria-label="Select event color"` | Event color |
| L428 | `aria-label="Cancel event creation"` | Cancel |
| L429 | `aria-label="Save event"` | Save Event |

---

### Games.tsx — 9/9 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L106 | `aria-label="Go back"` | Back |
| L155 | `aria-label="Play again"` | Play Again |
| L223 | `aria-label="Go back"` | Back |
| L305 | `aria-label="Go back"` | Back |
| L341 | `aria-label="Enter letter"` | Wordle key (Enter) |
| L360 | `aria-label="Type letter"` | Wordle key (letter) |
| L372 | `aria-label="Delete letter"` | Backspace (⌫) |
| L430 | `aria-label="Go back"` | Back |
| L582 | `aria-label="Go back"` | Back |

---

### Forge.tsx — 8/12 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L302 | `aria-label="Add files"` | Add files |
| L815 | `aria-label="Presets tab"` | Presets |
| L820 | `aria-label="Watch folders tab"` | Watch |
| L823 | `aria-label="Settings tab"` | Settings |
| L873 | `aria-label="Add watch folder"` | Add Watch Folder |
| L888 | `aria-label="Remove watch folder"` | Remove folder |
| L979 | `aria-label="Remove job"` | Remove job |
| L1052 | `aria-label="Start processing"` | Start |

---

### Achievements.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L205 | `aria-label="Filter by status"` | Status filter |
| L234 | `aria-label="Grid view"` | Grid view |
| L240 | `aria-label="List view"` | List view |
| L261 | `aria-label="Switch category"` | Category tab |
| L345 | `aria-label="View achievement"` | Achievement card |
| L428 | `aria-label="View achievement"` | Achievement card |
| L486 | `aria-label="Close achievement details"` | Close |

---

### PasswordGenerator.tsx (DEXAPP) — 4/7 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L132 | `aria-label="Toggle password history"` | History toggle |
| L216 | `aria-label="Clear all history"` | Clear All |
| L229 | `aria-label="Copy password"` | Copy |
| L230 | `aria-label="Delete password entry"` | Delete |

---

## PART 2: PAGES (sorted by missing count)

---

### Files.tsx — 14/15 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L499 | `aria-label="Action"` | Dynamic button |
| L522 | `aria-label="Show recent files"` | Recent |
| L541 | `aria-label="Select collection"` | Collection |
| L564 | `aria-label="Action"` | Button |
| L571 | `aria-label="Navigate forward"` | Forward nav |
| L611 | `aria-label="Clear search"` | Clear search |
| L621 | `aria-label="Toggle filters"` | Filters toggle |
| L634 | `aria-label="Toggle sort direction"` | Sort dir |
| L643 | `aria-label="List view"` | List view |
| L649 | `aria-label="Grid view"` | Grid view |
| L665 | `aria-label="Filter by date range"` | Date range |
| L680 | `aria-label="Filter by file size"` | Size range |
| L695 | `aria-label="Sort by"` | Sort option |
| L791 | `aria-label="Close file preview"` | Close preview |

---

### Gallery.tsx — 9/11 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L277 | `aria-label="Select album"` | Album select |
| L294 | `aria-label="Select album"` | Album select |
| L321 | `aria-label="Grid view"` | Grid view |
| L327 | `aria-label="List view"` | List view |
| L402 | `aria-label="Action"` | Dynamic button |
| L422 | `aria-label="Close lightbox"` | Close |
| L427 | `aria-label="Toggle favorite"` | Favorite |
| L439 | `aria-label="Previous image"` | Prev |
| L454 | `aria-label="Next image"` | Next |

---

### Audio.tsx — 7/10 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L376 | `aria-label="Select playlist"` | Playlist select |
| L393 | `aria-label="Select playlist"` | Playlist select |
| L408 | `aria-label="Show all tracks"` | All tracks |
| L469 | `aria-label="Action"` | Dynamic button |
| L493 | `aria-label="Toggle favorite"` | Favorite track |
| L503 | `aria-label="Toggle shuffle"` | Shuffle |
| L519 | `aria-label="Toggle repeat"` | Repeat |

---

### Home.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L335 | `aria-label="Toggle edit mode"` | Edit mode |
| L349 | `aria-label="Open widget picker"` | Add widget |
| L394 | `aria-label="Resize widget"` | Resize |
| L406 | `aria-label="Remove widget"` | Remove |
| L436 | `aria-label="Open widget picker"` | Add widget |
| L499 | `aria-label="Add widget"` | Add widget |
| L523 | `aria-label="Close widget picker"` | Close picker |

---

### Tasks.tsx — 6/6 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L301 | `aria-label="Select task list"` | List select |
| L335 | `aria-label="Toggle completed tasks"` | Show/hide completed |
| L354 | `aria-label="Add new task"` | Add task |
| L369 | `aria-label="Toggle task completion"` | Toggle task |
| L392 | `aria-label="Cycle task priority"` | Priority |
| L400 | `aria-label="Delete task"` | Delete task |

---

### Transfers.tsx — 5/6 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L124 | `aria-label="Transfer action"` | Action button |
| L219 | `aria-label="Transfer action"` | Action button |
| L287 | `aria-label="Accept upload"` | Accept |
| L292 | `aria-label="Reject upload"` | Reject |
| L314 | `aria-label="Transfer action"` | Action button |

---

### Video.tsx — 4/7 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L236 | `aria-label="Go back to video list"` | Back |
| L261 | `aria-label="Play video"` | Play |
| L292 | `aria-label="Toggle playback"` | Play/Pause |
| L345 | `aria-label="Select video category"` | Category |

---

### Workflows.tsx — 4/8 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L206 | `aria-label="Close workflow details"` | Close |
| L221 | `aria-label="Select workflow category"` | Category |
| L312 | `aria-label="Cancel editing"` | Cancel |
| L324 | `aria-label="Save workflow"` | Save |

---

### Notes.tsx — 3/13 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L421 | `aria-label="Select folder"` | Folder |
| L451 | `aria-label="Create new note"` | New note |
| L544 | `aria-label="Toggle preview mode"` | Preview |

---

### Dashboard.tsx — 1/2 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L527 | `aria-label="Open application"` | App launcher |

---

### Power.tsx — 1/3 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L59 | `aria-label="Resume"` | Resume |

---

## PART 3: COMPONENTS (sorted by missing count, top 50)

---

### MediaPlayer.tsx — 14/14 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L286 | `aria-label="Toggle playback"` | Play/Pause |
| L289 | `aria-label="Rewind 10 seconds"` | Seek back |
| L292 | `aria-label="Forward 10 seconds"` | Seek forward |
| L300 | `aria-label="Toggle mute"` | Mute |
| L330 | `aria-label="Toggle fullscreen"` | Fullscreen |
| L564 | `aria-label="Previous track"` | Prev track |
| L567 | `aria-label="Toggle playback"` | Play/Pause |
| L570 | `aria-label="Next track"` | Next track |
| L575 | `aria-label="Toggle shuffle"` | Shuffle |
| L585 | `aria-label="Repeat mode"` | Repeat |
| L727 | `aria-label="Action"` | Dynamic button |
| L844 | `aria-label="Previous track"` | ⏮ |
| L846 | `aria-label="Toggle playback"` | Play/Pause |
| L850 | `aria-label="Next track"` | ⏭ |

### Pagination.tsx — 14/14 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L185 | `aria-label="Previous page"` | Prev |
| L198 | `aria-label="Next page"` | Next |
| L215 | `aria-label="Previous page"` | Prev |
| L225 | `aria-label="Next page"` | Next |
| L242 | `aria-label="First page"` | Page 1 |
| L256 | `aria-label="Previous page"` | Prev |
| L279 | `aria-label="Go to page"` | Page number |
| L294 | `aria-label="Next page"` | Next |
| L308 | `aria-label="Last page"` | Last page |
| L468 | `aria-label="Page action"` | Page button |
| L541 | `aria-label="Page action"` | Page button |
| L560 | `aria-label="Page action"` | Page button |
| L623 | `aria-label="Page action"` | Page button |
| L630 | `aria-label="Page action"` | Page button |

### DatePicker.tsx — 12/12 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L339 | `aria-label="Clear date"` | Clear |
| L349 | `aria-label="Previous month"` | Navigate prev |
| L355 | `aria-label="Next month"` | Navigate next |
| L374 | `aria-label="Select date"` | Day select |
| L606 | `aria-label="Previous month"` | Prev month |
| L615 | `aria-label="Next month"` | Next month |
| L636 | `aria-label="Select date"` | Day select |
| L768 | `aria-label="Select hour"` | Hour |
| L782 | `aria-label="Select minute"` | Minute |
| L914 | `aria-label="Switch month/year view"` | View toggle |
| L925 | `aria-label="Select month"` | Month |
| L937 | `aria-label="Select year"` | Year |

### BackupManager.tsx — 10/10 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L235 | `aria-label="Import backup"` | Import |
| L236 | `aria-label="Toggle create backup"` | Create new |
| L254 | `aria-label="Select all sections"` | Select all |
| L255 | `aria-label="Deselect all sections"` | None |
| L269 | `aria-label="Create backup"` | Create |
| L294 | `aria-label="Confirm restore"` | Yes |
| L295 | `aria-label="Cancel restore"` | No |
| L299 | `aria-label="Restore backup"` | Restore |
| L300 | `aria-label="Export backup"` | Export |
| L301 | `aria-label="Delete backup"` | Delete |

### Comment.tsx — 10/10 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L222 | `aria-label="Comment action"` | Action |
| L295 | `aria-label="Comment action"` | Action |
| L490 | `aria-label="Comment action"` | Action |
| L504 | `aria-label="Comment action"` | Action |
| L530 | `aria-label="React to comment"` | Reaction |
| L547 | `aria-label="Comment action"` | Action |
| L553 | `aria-label="Reply to comment"` | Reply |
| L558 | `aria-label="Edit comment"` | Edit |
| L563 | `aria-label="Delete comment"` | Delete |
| L571 | `aria-label="Pin comment"` | Pin |

### ConfirmDialog.tsx — 10/10 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L194 | `aria-label="Cancel"` | Cancel button |
| L206 | `aria-label="Confirm"` | Confirm button |
| L306 | `aria-label="Close dialog"` | Close |
| L433 | `aria-label="Cancel"` | Cancel |
| L444 | `aria-label="Confirm"` | Confirm |
| L599 | `aria-label="Cancel"` | Cancel |
| L610 | `aria-label="Confirm"` | Confirm |
| L717 | `aria-label="Cancel"` | Cancel |
| L729 | `aria-label="Confirm"` | Confirm |
| L740 | `aria-label="Dismiss"` | Dismiss |

### NumberInput.tsx — 8/8 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L321 | `aria-label="Increment value"` | Up |
| L331 | `aria-label="Decrement value"` | Down |
| L347 | `aria-label="Increment value"` | Up |
| L357 | `aria-label="Decrement value"` | Down |
| L379 | `aria-label="Decrement value"` | Down |
| L415 | `aria-label="Increment value"` | Up |
| L649 | `aria-label="Decrement value"` | Decrease |
| L657 | `aria-label="Increment value"` | Increase |

### NotificationCenter.tsx — 8/8 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L182 | `aria-label="Close notifications"` | Close (×) |
| L187 | `aria-label="Show all notifications"` | All filter |
| L191 | `aria-label="Show unread only"` | Unread filter |
| L197 | `aria-label="Mark all as read"` | Mark all read |
| L198 | `aria-label="Clear all notifications"` | Clear all |
| L226 | `aria-label="Execute notification action"` | Action |
| L232 | `aria-label="Dismiss notification"` | Clear |
| L447 | `aria-label="Close toast"` | Close (×) |

### ErrorHandling.tsx — 8/8 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L204 | `aria-label="Toggle error details"` | Show details |
| L214 | `aria-label="Retry"` | Retry |
| L226 | `aria-label="Report error"` | Report |
| L305 | `aria-label="Primary action"` | Action |
| L317 | `aria-label="Secondary action"` | Action |
| L385 | `aria-label="Retry"` | Retry |
| L531 | `aria-label="Primary action"` | Action |
| L543 | `aria-label="Secondary action"` | Action |

### FilterSort.tsx — 8/8 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L83 | `aria-label="Toggle filter section"` | Expand filter |
| L205 | `aria-label="Toggle filter option"` | Toggle |
| L256 | `aria-label="Apply filter"` | Apply |
| L336 | `aria-label="Select filter option"` | Option select |
| L395 | `aria-label="Remove filter"` | Remove |
| L411 | `aria-label="Action"` | Action |
| L451 | `aria-label="Apply filter preset"` | Preset apply |
| L581 | `aria-label="Action"` | Action |

### VoiceNotes.tsx — 8/11 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L222 | `aria-label="Resume recording"` | Resume |
| L224 | `aria-label="Pause recording"` | Pause |
| L226 | `aria-label="Stop recording"` | Stop |
| L258 | `aria-label="Save edit"` | Save |
| L259 | `aria-label="Cancel edit"` | Cancel |
| L286 | `aria-label="Toggle favorite"` | Fav |
| L287 | `aria-label="Edit voice note"` | Edit |
| L288 | `aria-label="Delete voice note"` | Del |

### FileManager.tsx — 8/9 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L156 | `aria-label="Navigate to folder"` | Breadcrumb |
| L655 | `aria-label="Close"` | Close |
| L763 | `aria-label="New folder"` | New folder |
| L768 | `aria-label="Upload file"` | Upload |
| L773 | `aria-label="Action"` | Button |
| L796 | `aria-label="List view"` | List view |
| L810 | `aria-label="Grid view"` | Grid view |
| L824 | `aria-label="Tiles view"` | Tiles view |

### Annotation.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L238 | `aria-label="Select annotation type"` | Type select |
| L261 | `aria-label="Select annotation color"` | Color select |
| L288 | `aria-label="Deselect annotation"` | Deselect |
| L297 | `aria-label="Annotation action"` | Action |
| L602 | `aria-label="Select tool"` | Tool select |
| L623 | `aria-label="Select color"` | Color select |
| L752 | `aria-label="Action"` | Action |

### NotificationSystem.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L364 | `aria-label="Notification action"` | Action |
| L379 | `aria-label="Notification action"` | Action |
| L391 | `aria-label="Notification action"` | Action |
| L534 | `aria-label="Mark all as read"` | Mark all read |
| L539 | `aria-label="Clear all notifications"` | Clear all |
| L547 | `aria-label="Show all notifications"` | All filter |
| L557 | `aria-label="Show unread only"` | Unread filter |

### Timeline.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L190 | `aria-label="Mute track"` | Mute |
| L197 | `aria-label="Solo track"` | Solo |
| L204 | `aria-label="Lock track"` | Lock |
| L428 | `aria-label="Zoom out"` | Zoom out |
| L436 | `aria-label="Zoom in"` | Zoom in |
| L450 | `aria-label="Toggle snap"` | Snap |
| L457 | `aria-label="Toggle ripple edit"` | Ripple |

### FocusMode.tsx — 7/7 missing (100%)

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L430 | `aria-label="Toggle settings"` | Settings |
| L451 | `aria-label="Start focus session"` | Start |
| L456 | `aria-label="Session action"` | Action |
| L462 | `aria-label="Pause session"` | Pause |
| L466 | `aria-label="Session action"` | Action |
| L479 | `aria-label="Select ambient sound"` | Sound select |
| L593 | `aria-label="Close focus mode"` | Close |

### PomodoroTimer.tsx — 7/8 missing

| Line | Suggested `aria-label` | Context |
|---|---|---|
| L246 | `aria-label="Toggle auto-start breaks"` | Auto breaks |
| L253 | `aria-label="Toggle sound"` | Sound toggle |
| L301 | `aria-label="Start work session"` | Start |
| L307 | `aria-label="Pause timer"` | Pause |
| L309 | `aria-label="Resume timer"` | Resume |
| L311 | `aria-label="Skip to next phase"` | Skip |
| L312 | `aria-label="Reset timer"` | Reset |

### Remaining Components (6 missing each)

**Export.tsx** — 6/6: L292, L413, L422, L615, L634, L700  
**EmptyState.tsx** — 6/6: L302, L315, L419, L424, L531, L657  
**Modal.tsx** — 6/6: L192, L275, L372, L375, L477, L480  
**RichTextEditor.tsx** — 6/6: L379, L396, L479, L480, L481, L482  
**Button.tsx** — 6/7: L207, L242, L378, L388, L402, L458  
**PasswordGenerator.tsx** (component) — 6/6: L169, L170, L210, L215, L233, L234  
**SystemHealth.tsx** — 6/6: L171, L238, L245, L306, L332, L358  
**ImageGallery.tsx** — 6/6: L373, L379, L393, L609, L615, L627  

### Components with 5 missing

**Calendar.tsx** (component): L268, L277, L436, L672, L681  
**Navbar.tsx**: L143, L291, L389, L474, L653  
**LockScreen.tsx**: L257, L279, L313, L334, L373  
**SessionManager.tsx**: L223, L277, L285, L326, L327  
**TabGroups.tsx**: L218, L238, L352, L560, L565  
**Timer.tsx**: L451, L455, L459, L462, L722  
**ThemeManager.tsx**: L247, L252, L262, L276, L280  
**WorldClock.tsx**: L165, L169, L272, L273, L274  
**RecurringTasks.tsx**: L396, L406, L448, L479, L482  
**Rating.tsx**: L336, L358, L529, L538, L626  
**SnippetManager.tsx**: L192, L197, L203, L285, L286  

### Components with 4 missing

AudioRecorder, AppManager, BookmarkManager, Breadcrumb, Carousel, Copy, HabitTracker, Stepper, TableAdvanced, Tabs, Wizard, WorkspacePanel

### Components with 3 missing

ActivityFeed, Badge, Card, ClipboardHistory, ColorPicker, DataTable, DrawingCanvas, FilePreview, FileUpload, Input, MarkdownPreview, MixerPanel, Onboarding, PreviewPanel, Scroll, SearchSystem, Subtasks, Subtitles, SystemFeatures, TagInput, ThemeSystem, UndoRedo, VideoControls

### Components with 2 missing

AdvancedSearch, Alert, AssetBrowser, AutoComplete, Avatar, DashboardWidgets, DockCustomizer, HelpPanel, InspectorPanel, Kanban, KeyboardShortcuts, Popover, Progress, QuickNote, Select, SystemInfo, Toast, Toolbar, UnitConverter, VideoRecorder

### Components with 1 missing

Accessibility (L402), Accordion (L275), AnalyticsPanel (L183), BottomNavBar (L200), DragDrop (L432), Drawer (L617), Equalizer (L413), FirstLaunchHint (L125), GlobalSearch (L225), Keyboard (L499), Link (L566), List (L497), LoadingStates (L411), Menu (L505), NotificationBadge (L570), OfflineIndicator (L238), Panels (L104), QuickActions (L279), ResizablePanel (L196), SessionIndicator (L14), SettingsPanel (L612), Shortcut (L553), Sidebar (L151), Spotlight (L410), StatusBar (L234), TextArea (L400), Toggle (L236), WindowManager (L245)

---

## Recommended Fix Pattern

For each button, add `aria-label` as follows:

```tsx
// Before (icon-only button, no accessible name):
<button onClick={handleClose} style={styles.closeBtn}>{Icons.x}</button>

// After:
<button aria-label="Close" onClick={handleClose} style={styles.closeBtn}>{Icons.x}</button>
```

```tsx
// Before (text button, still good practice for screen readers):
<button onClick={onSave} style={styles.saveBtn}>Save</button>

// After (text content provides accessible name, but aria-label helps with icon+text):
<button aria-label="Save" onClick={onSave} style={styles.saveBtn}>Save</button>
```

**Priority order for fixes:**
1. Icon-only buttons (no text content) — **Critical** — screen readers have nothing to announce
2. Buttons with only emoji/symbol content (×, ⌫, ⏮ etc.) — **High** 
3. Dynamic/generic buttons with unclear context — **Medium**
4. Text buttons (already have accessible name from content) — **Low** but good practice

---

*End of audit. Total: ~835 buttons missing aria-label or title across 144 files.*
