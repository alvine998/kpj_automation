# BPJS SIPP Automation Architecture Documentation

## Overview
React Native implementation for automating BPJS SIPP (BPJS Ketenagakerjaan) web form submissions using WebView and JavaScript injection.

## Current Implementation Status
✅ **Fully Implemented** in `src/screens/WebView/SippWebView.tsx`

## Architecture Overview

### Core Components

#### 1. Data Management
- **Storage**: Uses AsyncStorage via `kpjStorage.ts` utility
- **Data Structure**: 
  ```typescript
  {
    baseKpj11: string,
    generated: string[],  // Array of KPJ numbers to process
    savedAt: number
  }
  ```
- **Firestore Integration**: Saves found user profiles to `foundUser` collection

#### 2. Automation Flow

```
┌─────────────────┐
│  Initialize     │
│  - Load KPJ list│
│  - Load session │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User clicks    │
│  "Process"      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Step 5: Click  │────▶│  Step 6: Input   │
│  "Sudah" button │     │  KPJ number      │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Step 7: Click         │
                    │  "Lanjut" button       │
                    └────────┬───────────────┘
                             │
                             ▼
                    ┌────────────────────────┐
                    │  Step 8: Check result  │
                    │  - FOUND → Step 9      │
                    │  - Not found → Next KPJ│
                    └────────┬───────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  Step 9: Extract │      │  Continue to     │
    │  Profile Data    │      │  next KPJ        │
    │  - NIK, Name,    │      │  (Step 5 again)  │
    │    Birthdate, etc│      └──────────────────┘
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Save to         │
    │  Firestore       │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Continue to     │
    │  next KPJ        │
    └──────────────────┘
```

#### 3. Step Details

**Step 5: Click "Sudah" Button**
- Selector: `button[href="#collapseTwo"]` or button with text "Sudah"
- Action: Clicks button to expand form section
- Delay: Immediate (handled by page load)

**Step 6: Input KPJ Number**
- Field: `input#kpj`
- Action: Sets value and dispatches input/change events
- Validation: Checks if field exists before input

**Step 7: Click "Lanjut" Button**
- Selector: Button with text "Lanjut" or `.btn.btn-primary`
- Action: Submits form
- Delay: 500ms after Step 6

**Step 8: Check Result**
- Waits for `.swal2-content` element
- Checks for messages:
  - "KPJ sudah tidak dapat digunakan" → Not found, continue
  - "terdaftar sebagai peserta BPJS Ketenagakerjaan" → FOUND, proceed to Step 9
- Clicks appropriate button (OK or "Lanjutkan")
- Delay: 1000ms intervals, max 80 attempts (~20 seconds)

**Step 9: Extract Profile Data**
- Waits for profile page to load
- Extracts fields:
  - NIK: `#no_identitas`, `input[name="no_identitas"]`, `#nik`
  - Name: `#nama_lengkap`, `input[name="nama_lengkap"]`
  - Birthdate: `#tgl_lahir`, `input[name="tgl_lahir"]`
  - Gender, Address, Postal Code, Phone, NPWP, Email
- Validation: Requires NIK (8+ digits) OR Birthdate (4+ chars)
- Delay: 1000ms intervals, max 30 attempts (~30 seconds)

#### 4. JavaScript Injection Pattern

```javascript
// Pattern used for form filling
webViewRef.current?.injectJavaScript(`
  (function () {
    function post(step, ok, extra) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({type:'process', step:step, ok:ok, ...extra})
        );
      } catch (e) {}
    }
    
    // Actual automation code here
    // - Query DOM elements
    // - Fill values
    // - Dispatch events
    // - Post messages back to React Native
  })();
  true;
`);
```

#### 5. State Management

**React State:**
- `kpjList`: Array of KPJ numbers to process
- `kpjIndex`: Current index being processed
- `pendingStep`: Current automation step (0, 5, 9, or 11)
- `checkedCount`: Number of KPJs checked
- `foundCount`: Number of KPJs found
- `notFoundCount`: Number of KPJs not found
- `debugLogs`: Array of log messages

**React Refs (for mutable values):**
- `kpjIndexRef`: Current index (to avoid stale closures)
- `pendingStepRef`: Current step (for async handlers)
- `step5InjectionLockRef`: Prevents duplicate Step 5-8 injections
- `step9InjectionLockRef`: Prevents duplicate Step 9 injections
- `profileCheckLockRef`: Prevents duplicate profile checks
- `lastStepXUrlRef`: Tracks URLs to detect navigation

#### 6. Timer Implementation

**Delays:**
- Step 5-8: 1000ms intervals (checking for elements)
- Step 9: 1000ms intervals (checking for profile fields)
- Safety timeouts: 10s (Step 5-8), 15s (Step 9)

**Cleanup:**
- All timers cleared in `useEffect` cleanup
- Locks reset after timeouts
- Proper cleanup on component unmount

#### 7. Error Handling

**Timeout Handling:**
- Safety timeouts for each injection step
- Automatic lock release after timeout
- Continues to next KPJ on timeout

**Error Recovery:**
- Step 8 failures: Mark as checked, continue to next
- Step 9 failures: Continue to next KPJ (with error logged)
- Firestore save errors: Log error, continue processing

**Race Condition Prevention:**
- Lock refs prevent duplicate injections
- URL tracking prevents duplicate checks
- State guards prevent invalid transitions

#### 8. Firestore Integration

**Collection: `foundUser`**

**Document Structure:**
```typescript
{
  userId: string,
  kpj: string,
  nik: string,
  name: string,
  birthdate: string,
  gender: string,
  marritalStatus: string,
  address: string,
  postalCode: string,
  phone: string,
  npwp: string,
  email: string,
  validasiDPT: boolean,  // false initially
  createdAt: Timestamp,
  sourceUrl: string
}
```

**Operations:**
- `addDoc`: Save found user profile
- `updateDoc`: Update validasiDPT after DPT check
- `deleteDoc`: Remove if not found in DPT

#### 9. Logging System

**Log Format:**
```
HH:MM:SS AM/PM  <message>
```

**Log Types:**
- Info: Normal operations
- Warning: ⚠️ Potential issues
- Error: ❌ Failures
- Success: ✅ Successful operations
- Progress: 📊 Status updates

**Log Storage:**
- Stored in React state (`debugLogs`)
- Limited to last 80 entries
- Displayed in debug panel (admin users)

#### 10. URL Navigation

**Key URLs:**
- Base: `https://sipp.bpjsketenagakerjaan.go.id/`
- Form: `https://sipp.bpjsketenagakerjaan.go.id/tenaga-kerja/baru/form-tambah-tk-individu`
- KPJ Form: `.../form-tambah/kpj`
- Profile Page: `.../form-tambah/...` (after clicking Lanjutkan)

**Navigation Detection:**
- `onLoadEnd`: Page load complete
- `onNavigationStateChange`: URL changes
- URL normalization for comparison

#### 11. User Interface

**Components:**
- WebView: Main automation interface
- Top Bar: Title, URL, progress, controls
- Debug Panel: Logs (admin only)
- KPJ List Modal: View/manage KPJ list
- Progress Indicators: Checked/Found/Not found counts

**Controls:**
- Process: Start automation
- KPJ: View KPJ list
- Hide/Show: Toggle debug panel
- Exit: Navigate back

## Key Design Patterns

### 1. Message-Based Communication
WebView communicates with React Native via `postMessage`:
```typescript
// From WebView
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'process',
  step: 8,
  ok: true,
  kpj: '12345678901',
  found: true
}));

// In React Native
onMessage={e => {
  const msg = JSON.parse(e.nativeEvent.data);
  if (msg.type === 'process' && msg.step === 8) {
    // Handle step 8 result
  }
}}
```

### 2. State Machine Pattern
Automation follows a state machine:
- State: `pendingStep` (0, 5, 9, 11)
- Transitions: Based on step completion
- Guards: Check conditions before transitions

### 3. Lock Pattern
Prevents race conditions:
```typescript
if (step9InjectionLockRef.current) {
  return; // Already processing
}
step9InjectionLockRef.current = true;
// ... do work ...
step9InjectionLockRef.current = false;
```

### 4. Retry Pattern
Automatic retries with exponential backoff:
- Step 5-8: 1000ms intervals, max 80 attempts
- Step 9: 1000ms intervals, max 30 attempts
- Profile check: Retry after 2s and 5s

## Performance Considerations

1. **Memory Management:**
   - Limited log history (80 entries)
   - Cleared timers on unmount
   - Efficient state updates

2. **Network Optimization:**
   - Cache-busting URLs only when needed
   - Minimal unnecessary reloads

3. **CPU Usage:**
   - Timer intervals: 1000ms (not too frequent)
   - Safety timeouts prevent infinite loops

## Security Considerations

1. **Data Storage:**
   - AsyncStorage for non-sensitive data
   - Firestore for user profiles (requires authentication)

2. **JavaScript Injection:**
   - Sanitized values (no user input directly injected)
   - JSON.stringify for safe serialization

3. **Session Management:**
   - User session required for Firestore saves
   - Role-based debug panel access

## Testing Recommendations

1. **Unit Tests:**
   - JavaScript injection functions
   - State transitions
   - Error handling

2. **Integration Tests:**
   - Complete automation flow
   - Firestore save operations
   - Navigation handling

3. **E2E Tests:**
   - Full automation cycle
   - Multiple KPJ processing
   - Error recovery scenarios

## Known Limitations

1. **Web Dependencies:**
   - Relies on specific DOM structure
   - Sensitive to website changes
   - Requires stable selectors

2. **Timing Issues:**
   - Race conditions possible (mitigated with locks)
   - Network delays can cause timeouts
   - Page load times vary

3. **Modal Handling:**
   - Some modals may require manual intervention
   - Modal detection not 100% reliable

## Future Improvements

1. **Configuration:**
   - Configurable timeouts
   - Customizable selectors
   - Adjustable retry counts

2. **Monitoring:**
   - Better error tracking
   - Performance metrics
   - Success rate analytics

3. **User Experience:**
   - Pause/resume functionality
   - Progress persistence
   - Resume after app restart

4. **Robustness:**
   - Better modal detection
   - Improved error recovery
   - More resilient navigation handling
