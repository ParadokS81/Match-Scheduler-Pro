# Hybrid Smart Polling Implementation Plan

## Overview
Replace the current fixed 30-second polling with an intelligent hybrid system that reduces server load by 70-80% while providing better user experience through instant refresh when users actually need fresh data.

## Current State vs Target State

### Current System
- Fixed 30-second polling regardless of user activity
- Every open tab polls independently
- High server load during low-engagement periods
- Users may see stale data when returning to the app

### Target System
- Tiered polling based on user engagement level
- Instant refresh when users show intent to interact
- Dramatically reduced server requests
- Fresh data exactly when users need it

## Implementation Strategy

### Phase 1: User Activity Detection Service
**File:** `frontend/services/UserActivityService.js`

**Features:**
- Track mouse movement, clicks, keyboard input
- Detect tab visibility changes (Page Visibility API)
- Calculate idle time and engagement level
- Provide callbacks for activity state changes

**Activity States:**
- **Actively Engaged**: Recent clicks/interactions within 1-2 minutes
- **Passively Monitoring**: Tab visible but no recent interaction (2-10 minutes)
- **Background**: Tab not visible or no activity for 10+ minutes
- **Idle**: No activity for 30+ minutes

### Phase 2: Smart Polling Controller
**File:** `frontend/services/SmartPollingService.js`

**Polling Frequencies:**
- **30 seconds**: When actively engaged (clicking, updating availability)
- **3 minutes**: When passively monitoring (tab visible, recent activity)
- **10 minutes**: When tab is background but recent session activity
- **Stop entirely**: After 30+ minutes of total inactivity

**Implementation:**
```javascript
// Adaptive polling based on engagement
function calculatePollInterval() {
    if (isActivelyEngaged()) return 30000;      // 30s
    if (isPassivelyMonitoring()) return 180000; // 3m
    if (isBackground()) return 600000;          // 10m
    return null; // Stop polling
}
```

### Phase 3: Instant Refresh Triggers
**Integration:** Enhance existing polling system

**Trigger Events:**
- Click anywhere on page after idle period (>2 minutes)
- Tab focus after being background
- Before any user-initiated action (availability update, team switch)
- Manual refresh button click

**User Feedback:**
- Brief "Refreshing..." indicator (500ms max)
- Visual confirmation of data freshness
- Error handling for failed refresh attempts

### Phase 4: Enhanced Delta Sync Integration
**Files:** Modify existing `WebAppAPI.js` polling logic

**Improvements:**
- Pass "last activity time" to delta sync API
- Server can optimize response based on time gap
- Better change detection for longer idle periods
- Batch multiple changes that occurred during absence

## Technical Implementation Details

### Activity Detection Events
```javascript
const ACTIVITY_EVENTS = [
    'mousedown', 'mousemove', 'keypress', 'scroll',
    'touchstart', 'click', 'focus', 'blur'
];
```

### Engagement Level Calculation
```javascript
function getEngagementLevel() {
    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime;
    const isTabVisible = !document.hidden;
    
    if (!isTabVisible) return 'background';
    if (timeSinceActivity < 120000) return 'active';      // 2 min
    if (timeSinceActivity < 600000) return 'passive';     // 10 min
    return 'idle';
}
```

### Instant Refresh Logic
```javascript
function handleUserReturn() {
    const idleTime = getIdleTime();
    
    // Only refresh if user was away for >2 minutes
    if (idleTime > 120000) {
        showRefreshIndicator();
        refreshScheduleData()
            .then(updateUI)
            .finally(hideRefreshIndicator);
    }
}
```

## Expected Benefits

### Server Load Reduction
- **Current**: ~40 requests/minute with 20 active users
- **Target**: ~8-12 requests/minute with same user base
- **Reduction**: 70-80% fewer server calls

### User Experience Improvements
- Immediate data refresh when returning to app
- Visual feedback during refresh operations
- Reduced battery usage on mobile devices
- Confidence in data freshness

### Resource Optimization
- Lower Google Apps Script quota usage
- Reduced bandwidth consumption
- Better performance on slower connections
- Less server-side caching pressure

## Testing Strategy

### Phase Testing
1. **Activity Detection**: Log engagement levels, verify state transitions
2. **Polling Intervals**: Monitor actual polling frequency across different states
3. **Instant Refresh**: Test with multiple users updating availability
4. **Integration**: Verify existing functionality remains intact

### Performance Monitoring
- Track server request reduction percentage
- Monitor user satisfaction with data freshness
- Measure time-to-fresh-data when users return
- Validate error handling for failed refreshes

### Rollback Plan
- Keep current polling as fallback option
- Feature flag to toggle between old/new systems
- Gradual rollout to subset of users initially

## Migration Strategy

### Development Approach
1. Build new services alongside existing system
2. Add feature flag to switch between polling methods
3. Test extensively with dev team
4. Gradual rollout to production users
5. Monitor and optimize based on real usage

### User Communication
- No user action required
- Behind-the-scenes improvement
- Optional: Add "Last updated" timestamp to UI
- Educate users about instant refresh behavior

## Success Metrics

### Technical Metrics
- 70%+ reduction in server requests
- <500ms refresh time for instant updates
- Zero degradation in data accuracy
- 99%+ uptime for activity detection

### User Experience Metrics
- Faster perceived performance when returning to app
- Reduced complaints about stale data
- Maintained or improved user engagement
- Positive feedback on responsiveness

## Timeline

### Week 1-2: Foundation
- Implement UserActivityService
- Basic engagement level detection
- Integration testing

### Week 3-4: Smart Polling
- Build SmartPollingService
- Integrate with existing delta sync
- Comprehensive testing

### Week 5-6: Instant Refresh
- Add refresh triggers
- UI feedback implementation
- Performance optimization

### Week 7: Production Rollout
- Feature flag deployment
- Gradual user migration
- Performance monitoring

## Future Enhancements

### Potential Additions
- Predictive prefetching based on usage patterns
- Smart cache warming for frequently accessed data
- Advanced user behavior analytics
- Cross-tab coordination (if needed)