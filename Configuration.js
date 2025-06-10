/**
 * Schedule Manager - Configuration System (Web App Edition)
 *
 * @version 2.5.1 (2025-06-10) - Added escapeHTML utility function
 * @version 2.5.0 (2025-05-30) - Phase 1D Major Refactor (Permissions Moved)
 *
 * Description: System-wide configuration for multi-team web application.
 * Core permission and role constants and logic have been moved to PermissionManager.js.
 * Core player data retrieval functions (getUserTeams, getUserDisplayName) moved to PlayerDataManager.js.
 *
 * CHANGELOG:
 * 2.5.1 - 2025-06-10 - Added escapeHTML utility function for server-side rendering security.
 * 2.5.0 - 2025-05-30 - Removed ROLES, PERMISSIONS constants, getUserRole, userHasPermission, getUserTeams, getUserDisplayName (moved to respective managers).
 * 2.4.0 - 2025-05-30 - Added ALLOWED_DIVISIONS, MAX_PLAYER_DISPLAY_NAME_LENGTH, MAX_PLAYER_INITIALS_LENGTH. Added MAX_WEEKS_PER_TEAM.
 * 2.3.0 - 2025-05-30 - Added LOGO_URL column to Teams schema, updated Drive configuration.
 */

// =============================================================================
// MASTER CONFIGURATION
// =============================================================================

const BLOCK_CONFIG = {
 
  // VERSION & METADATA
  VERSION: "2.5.1", // Updated version
  ARCHITECTURE: "WEB_APP",
  CREATED: "2025-05-30", 
  PHASE: "1D_REFACTOR_PERMISSIONS", // Reflecting current refactoring stage
  PROPERTY_KEYS: {
    DATABASE_ID: 'databaseId',
    USER_FAVORITES: 'userFavorites'
  },

  // MASTER SHEET STRUCTURE - Database Schema
  MASTER_SHEET: {
    SPREADSHEET_ID: null, 
    TEAMS_SHEET: "Teams",
    PLAYERS_SHEET: "Players",
    TEAM_TAB_PREFIX: "TEAM_", 
   
    TEAMS_COLUMNS: {
      TEAM_ID: 0,
      TEAM_NAME: 1,
      DIVISION: 2,
      LEADER_EMAIL: 3,
      JOIN_CODE: 4,
      CREATED_DATE: 5,
      LAST_ACTIVE: 6,
      MAX_PLAYERS: 7,
      IS_ACTIVE: 8,
      IS_PUBLIC: 9,
      PLAYER_COUNT: 10,
      PLAYER_LIST: 11,
      INITIALS_LIST: 12,
      AVAILABILITY_SHEET_NAME: 13,
      LOGO_URL: 14
    },
   
    PLAYERS_COLUMNS: {
          PLAYER_ID: 0,
          GOOGLE_EMAIL: 1,
          DISPLAY_NAME: 2,
          CREATED_DATE: 3,
          LAST_SEEN: 4,
          IS_ACTIVE: 5,
          TEAM1_ID: 6,
          // TEAM1_NAME and TEAM1_DIVISION are removed
          TEAM1_INITIALS: 7,
          TEAM1_ROLE: 8,
          TEAM1_JOIN_DATE: 9,
          TEAM2_ID: 10,
          // TEAM2_NAME and TEAM2_DIVISION are removed
          TEAM2_INITIALS: 11,
          TEAM2_ROLE: 12,
          TEAM2_JOIN_DATE: 13,
          DISCORD_USERNAME: 14,
          AVAILABILITY_TEMPLATE: 15
        },
  },
 
  // ROLES & PERMISSIONS are NOW DEFINED in PermissionManager.js
 
  TEAM_SETTINGS: {
    MAX_TEAMS_PER_PLAYER: 2,
    MAX_PLAYERS_PER_TEAM: 10,
    MIN_TEAM_NAME_LENGTH: 3,
    MAX_TEAM_NAME_LENGTH: 50,
    MIN_JOIN_CODE_LENGTH: 6,
    MAX_JOIN_CODE_LENGTH: 10,
    AUTO_CREATE_TEAM_TAB: true,
    JOIN_CODE_PREFIX_LENGTH: 4,
    JOIN_CODE_SUFFIX_LENGTH: 4,
    ALLOWED_DIVISIONS: ["1", "2", "3"],
    MAX_PLAYER_DISPLAY_NAME_LENGTH: 50,
    MAX_PLAYER_INITIALS_LENGTH: 2,
    MAX_WEEKS_PER_TEAM: 4 
  },
 
  TIME: {
    DEFAULT_START: "18:00",
    DEFAULT_END: "23:00",
    INTERVAL_MINUTES: 30,
    TIMEZONE: "CET", 
    STANDARD_TIME_SLOTS: [
      "18:00", "18:30", "19:00", "19:30", "20:00",
      "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"
    ]
  },
 
  LAYOUT: { 
    DAYS_PER_WEEK: 7,
    DAY_ABBREV: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    METADATA_COLUMNS: { 
      YEAR: 0,  
      MONTH: 1, 
      WEEK: 2   
    },
    TIME_COLUMN: 3, 
    DAYS_START_COLUMN: 4, 
    STANDARD_TIME_SLOTS_COUNT: 11,
  },
 
  COLORS: { 
    PRIMARY: "#4285F4", 
    SECONDARY: "#34A853", 
    ACCENT: "#FBBC05",  
    WARNING: "#EA4335", 
    LIGHT_GRAY: "#F1F3F4",
    DARK_GRAY: "#202124",
    SHEET: { 
      WEEKEND: "#FFF2CC", 
      WEEKDAY: "#FFFFFF", 
      DAY_HEADER_BG: "#4A86E8", 
      DAY_HEADER_FG: "#FFFFFF",
      TIME_COLUMN_BG: "#F3F3F3", 
      METADATA_COLUMN_BG: "#EFEFEF", 
      ONE_PLAYER: "#FFCCE5", 
      TWO_TO_THREE_PLAYERS: "#FFFFCC", 
      FOUR_PLUS_PLAYERS: "#CCFFCC"
    }
  },
 
  WEB_APP: {
    TITLE: "Schedule Manager Pro",
    DEFAULT_TEAM_VIEW_WEEKS: 2, 
    API_ENDPOINT_PREFIX: "SM_API_",
    // Add this new line:
    DISCORD_HELP_IMAGE_URL: "data:image/png;base64,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"
  },
 
  ADMIN: {
    ADMIN_USERS: ["david.larsen.1981@gmail.com"], // IMPORTANT: Replace with actual admin emails
    SYSTEM_EMAIL: "david.larsen.1981@gmail.com" // For system-initiated actions if any
  },
 
  LOGO: {
    DRIVE_FOLDER_ID: "1V88TOH_9Dkj_2gy2Bw6WjXKJVozDxUDr", 
    MAX_FILE_SIZE_MB: 5,
    ALLOWED_TYPES: ["image/png", "image/jpeg", "image/gif", "image/webp"],
    ALLOWED_EXTENSIONS: ["png", "jpg", "jpeg", "gif", "webp"], 
    DEFAULT_LOGO_URL: "" 
  },

  // CellProtection related settings were in a PROTECTION_CONFIG in CellProtection.js.
  // If any of those need to be globally configurable, they could be moved here.
  // For now, assuming PROTECTION_CONFIG remains local to CellProtection.js
  SETTINGS: { // General system settings from old PROTECTION_CONFIG
      AUTO_PROTECT_NEW_TEAMS: true, // Used by TeamDataManager
      // REMOVE_ALL_EDITORS: true, // This was part of PROTECTION_CONFIG, keep in CellProtection.js
      // WARNING_ONLY: false, // This was part of PROTECTION_CONFIG, keep in CellProtection.js
      // PROTECTION_MESSAGE: "This sheet is protected. Use the web application to make changes." // Keep in CellProtection.js

      // NEW SETTING for color coding:
      APPLY_SHEET_COLOR_CODING: false // Turn off by default for performance
  }
};

// =============================================================================
// GENERIC UTILITY FUNCTIONS (Retained in Configuration.js)
// =============================================================================

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function getCurrentCETDate() {
  return new Date(); 
}

function formatDate(date, format = "YYYY-MM-DD") {
  if (!(date instanceof Date) || isNaN(date.valueOf())) {
    Logger.log(`FormatDate: Invalid date received: ${date}`);
    return ""; 
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
 
  if (format === "YYYY-MM-DD") {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (format === "DD/MM/YYYY") {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  } else if (format === "MMMM") {
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                        "July", "August", "September", "October", "November", "December"];
    return monthNames[date.getMonth()];
  } else if (format === "DD/MM") { // New format for day headers
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  } else if (format === "YYYYMMDD") {
    return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMondayOfWeek(inputDate) {
  const date = inputDate ? new Date(inputDate.valueOf()) : getCurrentCETDate();
  const dayOfWeek = date.getDay(); 
  const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0); 
  return monday;
}

function getISOWeekNumber(dateInput) {
  const date = dateInput ? new Date(dateInput.valueOf()) : getCurrentCETDate();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getMondayFromWeekNumberAndYear(year, weekNumber) {
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(0,0,0,0);
  const jan4DayOfWeek = (jan4.getDay() + 6) % 7; 
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - jan4DayOfWeek);
  const targetMonday = new Date(mondayOfWeek1);
  targetMonday.setDate(mondayOfWeek1.getDate() + (weekNumber - 1) * 7);
  targetMonday.setHours(0,0,0,0); 
  return targetMonday; 
}

// =============================================================================
// GENERIC VALIDATION UTILITIES (Retained in Configuration.js)
// =============================================================================

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * @param {string} text The string to escape.
 * @return {string} The escaped string.
 */
function escapeHTML(text) {
  if (text === null || typeof text === 'undefined') return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateTeamName(teamName) {
  const errors = [];
  const minLength = BLOCK_CONFIG.TEAM_SETTINGS.MIN_TEAM_NAME_LENGTH;
  const maxLength = BLOCK_CONFIG.TEAM_SETTINGS.MAX_TEAM_NAME_LENGTH;
  if (!teamName || typeof teamName !== 'string' || teamName.trim().length === 0) {
    errors.push("Team name is required.");
  } else {
    const trimmedName = teamName.trim();
    if (trimmedName.length < minLength) errors.push(`Team name must be at least ${minLength} characters.`);
    if (trimmedName.length > maxLength) errors.push(`Team name must be no more than ${maxLength} characters.`);
    if (/[^a-zA-Z0-9\s\-_&().']/.test(trimmedName)) errors.push("Team name contains invalid characters.");
  }
  return { isValid: errors.length === 0, errors: errors };
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}


function isValidInitials(initials) { // Validates format only
  if (!initials || typeof initials !== 'string') return false;
  const exactLength = BLOCK_CONFIG.TEAM_SETTINGS.MAX_PLAYER_INITIALS_LENGTH; // From Configuration.js
  const trimmedInitials = initials.trim().toUpperCase(); // Added to ensure we test the processed version

  if (trimmedInitials.length !== exactLength) return false; // Check length first

  // CORRECTED REGEX: Allow uppercase letters OR numbers
  const initialsRegex = new RegExp(`^[A-Z0-9]{${exactLength}}$`);
  return initialsRegex.test(trimmedInitials); // Test the trimmed, uppercased version
}

function isValidJoinCodeFormat(joinCode) {
  if (!joinCode || typeof joinCode !== 'string') return false;
  const minLength = BLOCK_CONFIG.TEAM_SETTINGS.MIN_JOIN_CODE_LENGTH;
  const maxLength = BLOCK_CONFIG.TEAM_SETTINGS.MAX_JOIN_CODE_LENGTH;
  const code = joinCode.trim().toUpperCase();
  const joinCodeRegex = /^[A-Z0-9]+$/; 
  return code.length >= minLength && code.length <= maxLength && joinCodeRegex.test(code);
}

function validateLogoFile(blob) {
  const errors = [];
  if (!blob) {
    errors.push("No file provided.");
    return { isValid: false, errors: errors };
  }
  const maxSizeBytes = BLOCK_CONFIG.LOGO.MAX_FILE_SIZE_MB * 1024 * 1024;
  const allowedTypes = BLOCK_CONFIG.LOGO.ALLOWED_TYPES;
  if (blob.getBytes().length > maxSizeBytes) errors.push(`File size exceeds ${BLOCK_CONFIG.LOGO.MAX_FILE_SIZE_MB}MB.`);
  if (!allowedTypes.includes(blob.getContentType())) errors.push(`Invalid file type: ${blob.getContentType()}.`);
  return { isValid: errors.length === 0, errors: errors };
}

function validateLogoUrl(url) {
  const errors = [];
  if (url === null || typeof url === 'undefined' || url.trim() === '') {
      return { isValid: true, errors: [] }; 
  }
  if (typeof url !== 'string') {
    errors.push("Logo URL must be a string.");
    return { isValid: false, errors: errors };
  }
  try {
    new URL(url); 
    if (!url.toLowerCase().startsWith("http://") && !url.toLowerCase().startsWith("https://")) {
      errors.push("Logo URL must start with http:// or https://.");
    }
  } catch (e) {
    errors.push("Invalid URL format.");
  }
  return { isValid: errors.length === 0, errors: errors };
}

function validateLogoUrlAccess(url) {
  const validationResult = validateLogoUrl(url);
  if (!validationResult.isValid) return { isAccessible: false, message: validationResult.errors.join(' ') };
  if (url.trim() === '') return {isAccessible: true, message: "Empty URL."};
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, method: 'HEAD' });
    const responseCode = response.getResponseCode();
    const contentType = response.getHeaders()['Content-Type'] || response.getHeaders()['content-type'] || '';
    if (responseCode === 200) {
      return { isAccessible: true, message: "URL accessible.", isImage: contentType.toLowerCase().startsWith('image/') };
    } else {
      return { isAccessible: false, message: `URL not accessible. Status: ${responseCode}.` };
    }
  } catch (e) {
    return { isAccessible: false, message: `Error accessing URL: ${e.message}` };
  }
}

// =============================================================================
// GENERIC RESPONSE HANDLERS (Retained in Configuration.js)
// =============================================================================
function handleError(error, context = "Unknown") {
  const fileName = error.fileName || "N/A";
  const lineNumber = error.lineNumber || "N/A";
  const errorMessage = `${context}: ${error.message} (File: ${fileName}, Line: ${lineNumber})`;
  Logger.log(`ERROR - ${errorMessage}\nStack: ${error.stack || "No stack available"}`);
  return {
    success: false,
    message: `Operation failed in ${context}. ${error.message}`,
    error: errorMessage,
    timestamp: getCurrentTimestamp()
  };
}

function safeExecute(fn, context) {
  try {
    return fn();
  } catch (e) {
    return handleError(e, context);
  }
}

function createSuccessResponse(data = {}, message = "Operation successful") {
  return {
    success: true,
    message: message,
    timestamp: getCurrentTimestamp(),
    ...data 
  };
}

function createErrorResponse(message, details = {}) {
  return {
    success: false,
    message: message,
    timestamp: getCurrentTimestamp(),
    ...details 
  };
}

function clearMyTestAdminRoleCache() {
  try {
    // Call the global function directly, assuming it's defined in PermissionManager.js
    clearUserRoleCache("david.larsen.1981@gmail.com"); 
    Logger.log("Attempted to clear role cache for david.larsen.1981@gmail.com. Check PermissionManager logs for confirmation if any.");
    SpreadsheetApp.getActiveSpreadsheet().toast("Attempted to clear admin role cache.", "Cache Cleared", 5);
  } catch (e) {
    Logger.log(`Error in clearMyTestAdminRoleCache: ${e.message}. This might happen if PermissionManager.js or clearUserRoleCache isn't loaded/defined yet.`);
    SpreadsheetApp.getUi().alert("Error", `Could not clear cache: ${e.message}. Ensure PermissionManager.js is saved and the function exists.`);
  }
}

// Add this function to your Configuration.js for debugging cache issues
function clearAllCaches() {
  const CONTEXT = "Configuration.clearAllCaches";
  try {
    // Clear script cache
    const scriptCache = CacheService.getScriptCache();
    if (scriptCache) {
      // Get all cache keys that start with common prefixes
      const cacheKeyPrefixes = ['scheduleData_', 'userRole_', 'teamData_'];
      
      // Note: Apps Script doesn't provide a way to list all keys,
      // so you'll need to clear specific keys or use cache.removeAll()
      // if you want to clear everything
      
      Logger.log(`${CONTEXT}: Attempting to clear all caches`);
      
      // Clear all cache (nuclear option - use carefully)
      // scriptCache.removeAll();
      
      // Or clear specific patterns if you know the keys
      // Example: Remove user role caches for all known users
      const adminUsers = BLOCK_CONFIG.ADMIN.ADMIN_USERS || [];
      adminUsers.forEach(email => {
        const userRoleKey = `userRole_${email}`;
        scriptCache.remove(userRoleKey);
        Logger.log(`${CONTEXT}: Cleared cache for key: ${userRoleKey}`);
      });
      
      Logger.log(`${CONTEXT}: Cache clearing completed`);
      return createSuccessResponse({}, "Caches cleared successfully");
    }
    
    return createErrorResponse("Cache service not available");
  } catch (e) {
    Logger.log(`Error in ${CONTEXT}: ${e.message}`);
    return handleError(e, CONTEXT);
  }
}

// Function to clear specific team schedule caches
function clearTeamScheduleCache(teamId) {
  const CONTEXT = "Configuration.clearTeamScheduleCache";
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return createErrorResponse("Cache service not available");
    
    const teamData = getTeamData(teamId);
    if (!teamData) return createErrorResponse(`Team ${teamId} not found`);
    
    const sheetName = teamData.availabilitySheetName;
    if (!sheetName) return createErrorResponse("No sheet name found for team");
    
    // Clear cache for multiple weeks (you may need to adjust the range)
    const currentYear = new Date().getFullYear();
    const ranges = [
      { year: currentYear - 1, weeks: Array.from({length: 52}, (_, i) => i + 1) },
      { year: currentYear, weeks: Array.from({length: 52}, (_, i) => i + 1) },
      { year: currentYear + 1, weeks: Array.from({length: 52}, (_, i) => i + 1) }
    ];
    
    let clearedCount = 0;
    ranges.forEach(range => {
      range.weeks.forEach(week => {
        const cacheKey = `scheduleData_${sheetName}_${range.year}_W${week}`;
        cache.remove(cacheKey);
        clearedCount++;
      });
    });
    
    Logger.log(`${CONTEXT}: Cleared ${clearedCount} cache entries for team ${teamId}`);
    return createSuccessResponse({ clearedEntries: clearedCount }, `Cleared ${clearedCount} cache entries`);
    
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

/**
 * Gets the four-week block (current + 3 future) for client-side caching.
 * @return {Array<Object>} An array of four week objects, e.g., [{year: 2025, week: 24}, ...].
 */
function getAllAvailableWeeks() {
    const now = new Date();
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const weekDate = new Date(now);
        weekDate.setDate(now.getDate() + (i * 7));
        weeks.push({
            year: weekDate.getFullYear(),
            week: getISOWeekNumber(weekDate)
        });
    }
    return weeks;
}