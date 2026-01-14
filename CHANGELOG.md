# Focus Reader V2 - Changelog

This is a duplicated version of the original `reading-comprehension-app` for experimental changes.

## What Changed

### Color Scheme Overhaul
- **Removed**: Teal/gradient background aesthetic
- **Added**: Clean black/white/red theme matching the focus view
- Background changed from gradient to solid black (`#0a0a0a`)
- Accent color changed from teal (`#3fd6c6`) to red (`#ff3b30`)
- All panels now use subtle white transparency on black
- Reader view uses true black for maximum contrast
- Primary buttons are now red with white text
- Active states and focus highlights use red instead of teal

### Layout Redesign
- Changed from side-by-side panels to stacked vertical layout
- Reader/focus view now on top with full width
- Settings and upload controls moved below
- Reader area increased to 300px height for more prominence

### Speed Control Redesign
- **Removed**: Circular speedometer dial
- **Added**: Horizontal music-style fader/slider
- Controls (Start/Pause/Restart) are now centered
- WPM displayed as large white text below the slider
- Min/max labels (120/900) shown on slider ends
- White circular thumb with hover scaling effect

### Auto Pace Feature (NEW)
- Toggle in bottom-right of reader area
- Set a **Start WPM** (default 150) and **Max WPM** (default 400)
- Speed gradually increases as you progress through the text
- Great for warm-up training - starts slow, builds to target speed

### Live WPM Indicator (NEW)
- Shows current WPM in bottom-left of reader while playing
- Updates in real-time as auto-pace ramps up
- Fades out when paused

### Arrow Key Navigation (NEW)
- `←` step back one word
- `→` step forward one word
- Automatically pauses when stepping for review
- Perfect for re-reading missed words

### Code Quality Fixes
- Fixed variable shadowing in `deriveTitle()` (renamed `words` to `titleWords`)
- Simplified pause button label logic from nested ternary to readable if/else
- Added `console.debug` logging to empty catch blocks for debugging
- Added `beforeunload` handler to terminate OCR worker on page close
- Simplified `tokenize()` using nullish coalescing (`??`)
- Removed unused dial-related code and CSS

### Accessibility Improvements
- Added `:focus-visible` outline on buttons for keyboard navigation
- Added focus highlight (red border) on text inputs and textarea
- Updated keyboard hint to show all shortcuts: Space, R, ← →

---

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Start/Pause reading |
| `R` | Reset to beginning |
| `←` | Step back one word |
| `→` | Step forward one word |

---

**Original location**: `/Users/brad/Desktop/organized/reading-comprehension-app/`
**V2 location**: `/Users/brad/Desktop/organized/reading-comprehension-app-v2/`
