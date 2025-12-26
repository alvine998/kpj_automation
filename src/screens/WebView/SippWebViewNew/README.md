# BPJS SIPP Automation - Clean Implementation

This is a fresh, modular implementation of BPJS SIPP web automation following best practices and clear separation of concerns.

## Architecture

### File Structure

```
SippWebViewNew/
├── index.tsx          # Main component
├── types.ts           # TypeScript types and interfaces
├── config.ts          # Configuration constants
├── utils.ts           # Utility functions
├── scripts.ts         # JavaScript injection scripts
└── README.md          # This file
```

### Key Design Principles

1. **Separation of Concerns**: Each file has a single, well-defined responsibility
2. **Type Safety**: Full TypeScript support with comprehensive type definitions
3. **Modularity**: Functions are small, focused, and reusable
4. **Configurability**: All timing and behavior can be configured
5. **Error Handling**: Comprehensive error handling with recovery
6. **Logging**: Detailed logging for debugging and monitoring

## Components

### 1. Main Component (`index.tsx`)

The main React component that orchestrates the automation flow. It manages:
- State management (automation state, progress, logs)
- WebView lifecycle
- Message handling from injected JavaScript
- Integration with Firestore for data persistence

### 2. Types (`types.ts`)

Comprehensive TypeScript types for:
- Automation steps and states
- Configuration options
- Data structures (KPJ, Profile)
- Messages and results

### 3. Configuration (`config.ts`)

Centralized configuration including:
- Default timing values (delays, intervals, timeouts)
- URL constants
- CSS selectors
- Message patterns

### 4. Utilities (`utils.ts`)

Pure utility functions for:
- Log creation
- URL normalization and checking
- Message parsing
- Data validation

### 5. Scripts (`scripts.ts`)

JavaScript code to be injected into WebView:
- Auto-redirect script
- Steps 5-8 automation script
- Profile check script
- Step 9 extraction script

## Usage

### Basic Usage

```tsx
import SippWebViewNew from './screens/WebView/SippWebViewNew';

// In your navigation or App.tsx
<SippWebViewNew />
```

### Configuration

Modify `config.ts` to adjust timing and behavior:

```typescript
export const DEFAULT_CONFIG: AutomationConfig = {
  step5Delay: 200,           // Delay before step 5
  step6Delay: 500,           // Delay before step 6
  step7Delay: 500,           // Delay before step 7
  step8MaxAttempts: 80,      // Max attempts for step 8
  step8Interval: 1000,       // Check interval (ms)
  step9MaxAttempts: 30,      // Max attempts for step 9
  step9Interval: 1000,       // Check interval (ms)
  loadingCheckInterval: 500, // Loading check interval (ms)
  defaultTimeout: 20000,     // Default timeout (ms)
};
```

## Automation Flow

1. **Initialize**: Load KPJ list and session
2. **Start**: User clicks "Process" button
3. **Step 5**: Click "Sudah" button
4. **Step 6**: Input KPJ number
5. **Step 7**: Click "Lanjut" button
6. **Step 8**: Check result (FOUND or Not found)
7. **Step 9** (if FOUND): Extract profile data
8. **Save**: Save to Firestore
9. **Continue**: Process next KPJ or complete

## State Management

### Automation States

- `idle`: Not running
- `running`: Active automation
- `paused`: Temporarily paused (not implemented yet)
- `completed`: All KPJs processed
- `error`: Error occurred

### Progress Tracking

Tracks:
- Total KPJs
- Checked count
- Found count
- Not found count
- Current index

## Error Handling

### Timeout Handling

Each step has safety timeouts:
- Step 5-8: 20 seconds default
- Step 9: 20 seconds default

If timeout occurs:
- Lock is released
- Error is logged
- Automation continues to next KPJ

### Error Recovery

- **Step 8 failures**: Marked as checked, continue to next
- **Step 9 failures**: Error logged, continue to next
- **Firestore errors**: Error logged, continue processing

## Race Condition Prevention

Uses ref-based locks:
- `step5LockRef`: Prevents duplicate Step 5-8 injections
- `step9LockRef`: Prevents duplicate Step 9 injections
- `profileCheckLockRef`: Prevents duplicate profile checks

## Logging

### Log Types

- `info`: Normal operations
- `warning`: Potential issues
- `error`: Failures
- `success`: Successful operations

### Log Format

```
HH:MM:SS AM/PM  <message>
```

Logs are stored in state and displayed in debug panel (admin users).

## Firestore Integration

### Collection: `foundUser`

**Document Structure:**
```typescript
{
  userId: string,
  kpj: string,
  nik: string,
  name: string,
  birthdate: string,
  gender?: string,
  marritalStatus?: string,
  address?: string,
  postalCode?: string,
  phone?: string,
  npwp?: string,
  email?: string,
  validasiDPT: boolean,
  createdAt: Timestamp,
  sourceUrl: string
}
```

## Testing

### Manual Testing Checklist

1. ✅ Load KPJ list
2. ✅ Start automation
3. ✅ Process single KPJ (FOUND)
4. ✅ Process single KPJ (Not found)
5. ✅ Process multiple KPJs
6. ✅ Handle errors gracefully
7. ✅ Save to Firestore correctly
8. ✅ Progress tracking accurate
9. ✅ Logs display correctly
10. ✅ Stop automation works

### Unit Testing Recommendations

- Test utility functions (URL normalization, validation)
- Test configuration constants
- Test script generation
- Test state transitions

### Integration Testing Recommendations

- Test complete automation flow
- Test error scenarios
- Test Firestore integration
- Test WebView communication

## Performance Considerations

1. **Memory**: Limited log history (80 entries)
2. **CPU**: Timer intervals set appropriately (500-1000ms)
3. **Network**: Cache-busting only when needed
4. **Cleanup**: All timers cleared on unmount

## Security Considerations

1. **Data Storage**: AsyncStorage for non-sensitive data
2. **Firestore**: Requires authenticated user session
3. **JavaScript Injection**: Values sanitized, JSON.stringify used
4. **Session**: Role-based debug panel access

## Migration from Old Implementation

The new implementation:
- ✅ Follows the same automation flow
- ✅ Uses same Firestore structure
- ✅ Compatible with existing data
- ✅ Better code organization
- ✅ Improved error handling
- ✅ Enhanced logging

To migrate:
1. Update import in `App.tsx`
2. Test thoroughly
3. Monitor for any issues

## Future Enhancements

Potential improvements:
- [ ] Pause/resume functionality
- [ ] Progress persistence across app restarts
- [ ] Configurable selectors via UI
- [ ] Performance metrics
- [ ] Success rate analytics
- [ ] Better modal detection
- [ ] Retry strategies
- [ ] Batch processing optimization

## Troubleshooting

### Common Issues

**Issue**: Automation not starting
- **Check**: KPJ list is loaded
- **Check**: User session exists
- **Check**: WebView loads correctly

**Issue**: Step 9 not extracting data
- **Check**: Profile page loads correctly
- **Check**: Selectors are correct
- **Check**: Logs for error messages

**Issue**: Data not saving to Firestore
- **Check**: User session exists
- **Check**: Firestore permissions
- **Check**: Network connectivity
- **Check**: Logs for error messages

**Issue**: Automation stops prematurely
- **Check**: Timeout values
- **Check**: Network issues
- **Check**: Website changes (selectors)

## Support

For issues or questions:
1. Check logs in debug panel
2. Review error messages
3. Check Firestore console
4. Verify website structure hasn't changed
