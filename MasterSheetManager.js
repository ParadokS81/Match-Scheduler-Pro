/**
 * Schedule Manager - Master Sheet Database Manager (Clean Framework - No Sample Data)
 *
 * @version 1.5.0 (2025-06-07) - Removed all sample data creation for clean framework
 * @version 1.4.0 (2025-05-31) - Updated _msm_createTeamScheduleStructure for static Row 1 headers.
 * @version 1.3.2 (2025-05-30) - Corrected all inter-file function calls to be direct.
 *
 * Description: Creates and manages the centralized master spreadsheet database.
 * Now creates completely clean framework with no sample teams, players, or sheets.
 */

// ROLES is now a global constant defined in PermissionManager.js
// BLOCK_CONFIG is from Configuration.js
// TEST_CONFIG is from Debug.js (used for sample data emails)
// Utility functions like getCurrentTimestamp, createSuccessResponse, createErrorResponse,
// formatDate, getISOWeekNumber, getMondayFromWeekNumberAndYear, getCurrentCETDate are from Configuration.js
// Manager functions (e.g., syncTeamPlayerData from PlayerDataManager.js, createSingleWeekBlock from WeekBlockManager.js)
// are called directly, assuming they are globally available.

// =============================================================================
// MASTER SHEET CREATION ORCHESTRATION
// =============================================================================

function createMasterSheetStructure() {
  const CONTEXT = "MasterSheetManager.createMasterSheetStructure";
  try {
    Logger.log(`=== ${CONTEXT}: STARTING ===`);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = { success: true, sheetsCreated: [], errors: [], timestamp: getCurrentTimestamp() };
    
    const steps = [
      { name: "Teams Sheet", func: () => _msm_createTeamsSheet(ss) }, 
      { name: "Players Sheet", func: () => _msm_createPlayersSheet(ss) },
      { name: "System Cache Sheet", func: () => _msm_createSystemCacheSheet(ss) }, // <-- ADD THIS STEP
      { name: "Master Sheet Properties", func: () => _msm_setupMasterSheetProperties() }
    ];

    for (const step of steps) {
      try {
        const stepResult = step.func();
        if (stepResult.success) {
          if (step.name.includes("Sheet") && stepResult.data && stepResult.data.sheetName) {
            results.sheetsCreated.push(stepResult.data.sheetName); 
          }
          if (step.name === "Master Sheet Properties") results.propertiesSet = true;
        } else {
          results.errors.push(`${step.name}: ${stepResult.message}`);
        }
      } catch (e) {
        results.errors.push(`${step.name} (Exception): ${e.message}`);
        Logger.log(`ERROR during ${CONTEXT} at step ${step.name}: ${e.message}\nStack: ${e.stack}`);
      }
    }
    results.success = results.errors.length === 0;
    results.message = results.success ? `Clean database framework created successfully! Sheets: ${results.sheetsCreated.join(", ")}.` : `Database created with ${results.errors.length} errors: ${results.errors.join('; ')}`;
    Logger.log(`${CONTEXT}: ${results.message}`);
    return results;
  } catch (e) {
    Logger.log(`❌ CRITICAL ERROR in ${CONTEXT}: ${e.message}\nStack: ${e.stack}`);
    return createErrorResponse(`Critical database creation error: ${e.message}`);
  }
}

// =============================================================================
// INDIVIDUAL SHEET CREATION FUNCTIONS (Prefixed _msm_ to avoid global conflicts)
// =============================================================================

function _msm_generateInternalJoinCode(teamName = '') {
    let baseCode = teamName ? teamName.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase() : 'TEAM';
    if (baseCode.length < 2) baseCode = 'TEAM';
    return baseCode + Math.floor(1000 + Math.random() * 9000);
}

function _msm_generateInternalSamplePlayerId(displayName = "Player") {
    const namePart = displayName ? displayName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') : "SMPL";
    return `S_PLAYER_${namePart}_${Math.floor(Math.random()*10000)}`;
}

function _msm_generateInternalSampleTeamId(teamName = "Team") {
    const prefix = teamName ? teamName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') : "TEAM";
    const finalPrefix = prefix || "TEAM";
    return `${BLOCK_CONFIG.MASTER_SHEET.TEAM_TAB_PREFIX}${finalPrefix}_${Utilities.getUuid().substring(0,6)}`;
}

function _msm_createSystemCacheSheet(spreadsheet) {
  const CONTEXT = "MasterSheetManager._msm_createSystemCacheSheet";
  try {
    const sheetName = 'SYSTEM_CACHE';
    Logger.log(`${CONTEXT}: Creating or clearing ${sheetName} sheet...`);
    let cacheSheet = spreadsheet.getSheetByName(sheetName);
    if (cacheSheet) {
      cacheSheet.clear();
    } else {
      cacheSheet = spreadsheet.insertSheet(sheetName);
    }

    const headers = ["TeamID", "TeamName", "Division", "LogoURL", "IsPublic", "RosterJSON"];
    cacheSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    cacheSheet.getRange('G1').setValue(new Date().toISOString()).setNote("Master Timestamp for Teams List");
    
    cacheSheet.hideSheet(); 
    
    Logger.log(`✅ ${CONTEXT}: ${sheetName} sheet created and hidden.`);
    return createSuccessResponse({ sheetName: sheetName });
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function _msm_createTeamsSheet(spreadsheet) {
  const CONTEXT = "MasterSheetManager._msm_createTeamsSheet";
  try {
    Logger.log(`${CONTEXT}: Creating empty Teams sheet...`);
    let teamsSheet = spreadsheet.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (teamsSheet) { teamsSheet.clear(); } else { teamsSheet = spreadsheet.insertSheet(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET); }
    
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    const finalHeaders = ["TeamID", "TeamName", "Division", "LeaderEmail", "JoinCode", "CreatedDate", "LastActive", "MaxPlayers", "IsActive", "IsPublic", "PlayerCount", "PlayerList", "InitialsList", "AvailabilitySheetName", "LogoURL"];
    if (finalHeaders.length !== Object.keys(tCols).length) { return createErrorResponse(`Header length mismatch in ${CONTEXT}.`); }

    teamsSheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]).setFontWeight('bold').setBackground(BLOCK_CONFIG.COLORS.PRIMARY).setFontColor('white');
    teamsSheet.setColumnWidth(tCols.TEAM_ID + 1, 200); 
    teamsSheet.setColumnWidth(tCols.TEAM_NAME + 1, 180);
    teamsSheet.setColumnWidth(tCols.LEADER_EMAIL + 1, 200);
    teamsSheet.setColumnWidth(tCols.PLAYER_LIST + 1, 250);
    teamsSheet.setColumnWidth(tCols.INITIALS_LIST + 1, 150);
    teamsSheet.setColumnWidth(tCols.AVAILABILITY_SHEET_NAME + 1, 200);
    teamsSheet.setColumnWidth(tCols.LOGO_URL + 1, 250);

    // NO SAMPLE TEAMS CREATED - Clean framework only
    
    Logger.log(`✅ ${CONTEXT}: Empty Teams sheet created successfully.`);
    return createSuccessResponse({ sheetName: BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET });
  } catch (e) { return handleError(e, CONTEXT); } 
}

function _msm_createPlayersSheet(spreadsheet) {
  const CONTEXT = "MasterSheetManager._msm_createPlayersSheet";
  try {
    Logger.log(`${CONTEXT}: Creating empty Players sheet...`);
    let playersSheet = spreadsheet.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET);
    if (playersSheet) { playersSheet.clear(); } else { playersSheet = spreadsheet.insertSheet(BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET); }

    const pCols = BLOCK_CONFIG.MASTER_SHEET.PLAYERS_COLUMNS;
    // Updated headers to match the new simplified schema
    const finalPHeaders = [
        'PlayerID','GoogleEmail','DisplayName','CreatedDate','LastSeen','IsActive',
        'Team1ID','Team1Initials','Team1Role','Team1JoinDate',
        'Team2ID','Team2Initials','Team2Role','Team2JoinDate',
        'DiscordUsername','AvailabilityTemplate'
    ];
    if (finalPHeaders.length !== Object.keys(pCols).length) { 
        return createErrorResponse(`Header length mismatch in ${CONTEXT}. Expected ${Object.keys(pCols).length}, got ${finalPHeaders.length}.`); 
    }

    playersSheet.getRange(1, 1, 1, finalPHeaders.length).setValues([finalPHeaders]).setFontWeight('bold').setBackground(BLOCK_CONFIG.COLORS.SECONDARY).setFontColor('white');
    playersSheet.setColumnWidth(pCols.PLAYER_ID + 1, 200);
    playersSheet.setColumnWidth(pCols.GOOGLE_EMAIL + 1, 200);
    playersSheet.setColumnWidth(pCols.DISPLAY_NAME + 1, 180);
    playersSheet.setColumnWidth(pCols.DISCORD_USERNAME + 1, 180);

    Logger.log(`✅ ${CONTEXT}: Empty Players sheet created successfully with simplified schema.`);
    return createSuccessResponse({ sheetName: BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET });
  } catch (e) { return handleError(e, CONTEXT); }
}

function _msm_createSampleTeamTabs(spreadsheet) {
  const CONTEXT = "MasterSheetManager._msm_createSampleTeamTabs";
  try {
    Logger.log(`${CONTEXT}: Skipping sample team tabs - clean framework only...`);
    
    // NO SAMPLE TEAM TABS CREATED - Clean framework only
    
    Logger.log(`✅ ${CONTEXT}: No sample team tabs created (clean framework).`);
    return createSuccessResponse({ data: { tabsCreated: [] } }, "Clean framework - no sample team tabs created.");
  } catch (e) { return handleError(e, CONTEXT); }
}

function _msm_createTeamTab(spreadsheet, availabilitySheetName, teamName) {
  const CONTEXT = "MasterSheetManager._msm_createTeamTab";
  try {
    Logger.log(`${CONTEXT}: Processing team tab: ${availabilitySheetName} for ${teamName}`);
    let teamSheet = spreadsheet.getSheetByName(availabilitySheetName);
    if (teamSheet) { 
        // If sheet exists, clear it completely before rebuilding structure
        teamSheet.clear(); 
        teamSheet.clearConditionalFormatRules();
        // Ensure it's active for frozen row setting, though clear() might do this
        // spreadsheet.setActiveSheet(teamSheet); 
    } else { 
        teamSheet = spreadsheet.insertSheet(availabilitySheetName); 
        // spreadsheet.setActiveSheet(teamSheet);
    }
    return _msm_createTeamScheduleStructure(teamSheet, teamName); 
  } catch (e) { return handleError(e, CONTEXT); }
}

/**
 * Sets up the structure for a team's availability sheet, including Row 1 static headers
 * and initial weekly blocks.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} teamSheet The sheet for the team.
 * @param {string} teamName The name of the team.
 * @return {Object} Result of the operation.
 */
function _msm_createTeamScheduleStructure(teamSheet, teamName) { 
  const CONTEXT = "MasterSheetManager._msm_createTeamScheduleStructure (Static Row 1 Headers)";
  try {
    Logger.log(`${CONTEXT}: Setting up sheet structure for ${teamName} on sheet '${teamSheet.getName()}'`);
    teamSheet.clear(); // Full clear to ensure clean slate
    teamSheet.clearConditionalFormatRules();
    
    // --- Setup Row 1 Static Headers ---
    const headerRow = teamSheet.getRange(1, 1, 1, 25); // Assuming up to Column Y for now, can be adjusted
    const headers = [];
    
    // A1: Title
    headers[0] = `Availability Schedule: ${teamName}`; 
    // B1, C1: Can be empty or "Year", "Month", "Week" if preferred above data cols
    headers[BLOCK_CONFIG.LAYOUT.METADATA_COLUMNS.YEAR] = "Year"; // Col A if 0-indexed
    headers[BLOCK_CONFIG.LAYOUT.METADATA_COLUMNS.MONTH] = "Month"; // Col B
    headers[BLOCK_CONFIG.LAYOUT.METADATA_COLUMNS.WEEK] = "Week #"; // Col C
    
    headers[BLOCK_CONFIG.LAYOUT.TIME_COLUMN] = "Time"; // Col D
    
    const daysAbbr = BLOCK_CONFIG.LAYOUT.DAY_ABBREV; // Mon, Tue, ...
    for(let i=0; i < daysAbbr.length; i++) {
        headers[BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + i] = daysAbbr[i]; // E.g., E1="Mon", F1="Tue"
    }
    
    // Headers for the new "Team Block" section
    const rosterBlockInitialStartCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + daysAbbr.length; // Column after Sunday
    headers[rosterBlockInitialStartCol] = "Roster Attribute"; // Label Column (e.g., L1)
    
    const maxPlayers = BLOCK_CONFIG.TEAM_SETTINGS.MAX_PLAYERS_PER_TEAM;
    for (let p = 0; p < maxPlayers; p++) {
        headers[rosterBlockInitialStartCol + 1 + p] = `Player ${p + 1}`; // P1, P2...
    }
    headers[rosterBlockInitialStartCol + 1 + maxPlayers] = "Weekly Roster Changes"; // Changelog column

    teamSheet.getRange(1, 1, 1, headers.length).setValues([headers])
             .setFontWeight("bold")
             .setBackground(BLOCK_CONFIG.COLORS.SHEET.DAY_HEADER_BG) // Using a consistent header color
             .setFontColor(BLOCK_CONFIG.COLORS.SHEET.DAY_HEADER_FG)
             .setHorizontalAlignment("center")
             .setWrap(true);
    
    // Merge title cell A1:C1
    teamSheet.getRange("A1:C1").mergeAcross();
    teamSheet.getRange("A1").setHorizontalAlignment("left");

    teamSheet.setFrozenRows(1);
    Logger.log(`${CONTEXT}: Static Row 1 headers created and frozen for '${teamSheet.getName()}'.`);

    // --- Provision Initial Weekly Data Blocks (starting from Row 2) ---
    const initialBlockStartRow = 2; // Data blocks start from row 2
    const currentCetDate = getCurrentCETDate();
    const initialYear = currentCetDate.getFullYear();
    const initialWeekNum = getISOWeekNumber(currentCetDate);
    const weeksToProvision = BLOCK_CONFIG.TEAM_SETTINGS.MAX_WEEKS_PER_TEAM || 4; 

    let yearToProcess = initialYear;
    let weekToProcess = initialWeekNum;
    let blocksCreatedCount = 0;
    let lastBlockEndY = initialBlockStartRow -1; // To calculate next block's start

    for (let i = 0; i < weeksToProvision; i++) {
      const nextBlockDataStartRow = lastBlockEndY + 1; 
      const blockResult = createSingleWeekBlock(teamSheet, nextBlockDataStartRow, yearToProcess, weekToProcess);
      
      if (blockResult && blockResult.success && blockResult.endRow) { 
        blocksCreatedCount++;
        lastBlockEndY = blockResult.endRow; // endRow is the last data row of the created block
      } else {
        const errMsg = `Failed to create week block ${yearToProcess}-W${weekToProcess} for team ${teamName}. Result: ${JSON.stringify(blockResult)}`;
        Logger.log(`❌ ${CONTEXT}: ERROR - ${errMsg}`);
        return createErrorResponse(errMsg); 
      }
      
      const mondayOfCurrentBlock = getMondayFromWeekNumberAndYear(yearToProcess, weekToProcess);
      const nextMonday = new Date(mondayOfCurrentBlock);
      nextMonday.setDate(mondayOfCurrentBlock.getDate() + 7);
      yearToProcess = nextMonday.getFullYear();
      weekToProcess = getISOWeekNumber(nextMonday);
    }
    Logger.log(`✅ ${CONTEXT}: Initial ${blocksCreatedCount} data blocks provisioned for ${teamName} on '${teamSheet.getName()}'.`);

    // NO SAMPLE AVAILABILITY DATA CREATED - Clean framework only

    return createSuccessResponse({ teamName: teamName, blocksProvisioned: blocksCreatedCount, structure: "Static_Row1_Headers_Phase_1D_Vertical_Week_Blocks" });
  } catch (e) { return handleError(e, CONTEXT); }
}


// =============================================================================
// PROPERTIES & VALIDATION
// =============================================================================
function _msm_setupMasterSheetProperties() {
  const CONTEXT = "MasterSheetManager._msm_setupMasterSheetProperties";
  try {
    const docProps = PropertiesService.getDocumentProperties();
    docProps.setProperties({
        SCHEMA_VERSION: BLOCK_CONFIG.VERSION,
        SETUP_DATE: getCurrentTimestamp(),
        LAST_MAINTENANCE: getCurrentTimestamp()
    });
    Logger.log(`✅ ${CONTEXT}: Document properties configured.`);
    return createSuccessResponse({}, "Document properties configured.");
  } catch (e) { return handleError(e, CONTEXT); }
}

function _msm_validateMasterSheetStructure() {
  const CONTEXT = "MasterSheetManager._msm_validateMasterSheetStructure";
  try {
    Logger.log(`${CONTEXT}: Validating master sheet structure...`);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = { success: true, issues: [], sheetsFound: [], teamTabsInfo: [] };
    const requiredSheets = [
        BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET,
        BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET
    ];
    const allSheets = ss.getSheets();
    const allSheetNames = allSheets.map(s => s.getName());

    requiredSheets.forEach(sheetName => {
        if (allSheetNames.includes(sheetName)) {
            results.sheetsFound.push(sheetName);
        } else {
            results.issues.push(`Required sheet missing: ${sheetName}`);
            results.success = false;
        }
    });
    
    allSheets.forEach(sheet => {
      if (sheet.getName().startsWith(BLOCK_CONFIG.MASTER_SHEET.TEAM_TAB_PREFIX)) {
        const blocks = findAllWeekBlocks(sheet); 
        const firstBlockInfo = blocks.length > 0 ? validateBlockStructure(sheet, blocks[0].startRow) : {isValid: null, errors: ["No blocks found for validation"]};
        results.teamTabsInfo.push({
            name: sheet.getName(),
            blockCount: blocks.length,
            firstBlockValid: firstBlockInfo.isValid,
            firstBlockErrors: firstBlockInfo.errors
        });
        if (!firstBlockInfo.isValid && blocks.length > 0) results.success = false; // Consider it an issue if first block is invalid
      }
    });

    results.message = results.success ? "Master sheet structure appears valid." : `Validation issues found: ${results.issues.join('; ')}`;
    Logger.log(`${CONTEXT}: ${results.message}`);
    return createSuccessResponse(results, results.message);
  } catch (e) { return handleError(e, CONTEXT); }
}

function initializeDatabaseId() {
  const CONTEXT = "MasterSheetManager.initializeDatabaseId";
  try {
    const dbId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const dbIdKey = BLOCK_CONFIG.PROPERTY_KEYS.DATABASE_ID;
    
    PropertiesService.getScriptProperties().setProperty(dbIdKey, dbId);
    
    Logger.log(`${CONTEXT}: Set new Database ID in ScriptProperties: ${dbId}`);
    return createSuccessResponse({ databaseId: dbId }, "Database ID initialized successfully.");
  } catch(e) {
    Logger.log(`CRITICAL WARNING in ${CONTEXT}: Could not set Database ID in ScriptProperties. Error: ${e.message}`);
    return handleError(e, CONTEXT);
  }
}

// =============================================================================
// DATA CLEANUP & RESET FUNCTIONS (Core utilities for database state management)
// =============================================================================
function completeDataCleanup() {
  const CONTEXT = "MasterSheetManager.completeDataCleanup";
  const results = { 
    success: true, sheetsDeleted: [], propertiesCleared: 0, errors: [], message: "Cleanup initiated.",
    timestamp: getCurrentTimestamp() 
  };
  try {
    Logger.log(`=== ${CONTEXT}: PERFORMING COMPLETE DATA CLEANUP ===`);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const initialSheets = ss.getSheets();
    let keepFirstSheet = null;

    if (initialSheets.length > 0) {
        keepFirstSheet = initialSheets[0];
        for (let i = initialSheets.length - 1; i >= 0; i--) { 
            if (initialSheets[i].getSheetId() !== keepFirstSheet.getSheetId()) {
                const sheetName = initialSheets[i].getName();
                try { ss.deleteSheet(initialSheets[i]); results.sheetsDeleted.push(sheetName); } 
                catch (e) { results.errors.push(`Failed to delete sheet '${sheetName}': ${e.message}`); }
            }
        }
        try {
            keepFirstSheet.clearContents().clearFormats().setName('Temporary');
        } catch (e) { results.errors.push(`Failed to clear/rename remaining sheet: ${e.message}`);}
    } else {
        try { ss.insertSheet('Temporary'); } 
        catch(e) { results.errors.push(`Failed to insert 'Temporary' sheet: ${e.message}`);}
    }
    try {
      const docProps = PropertiesService.getDocumentProperties();
      const docKeys = docProps.getKeys();
      if (docKeys.length > 0) { docProps.deleteAllProperties(); results.propertiesCleared += docKeys.length; }
    } catch (e) { results.errors.push(`Failed to clear Document Properties: ${e.message}`); }
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      const scriptKeys = scriptProps.getKeys();
      if (scriptKeys.length > 0) { scriptProps.deleteAllProperties(); results.propertiesCleared += scriptKeys.length; }
    } catch (e) { results.errors.push(`Failed to clear Script Properties: ${e.message}`); }
    try { CacheService.getScriptCache().removeAll( CacheService.getScriptCache().getAll(docProps.getKeys().concat(scriptProps.getKeys())).map(k=>k)); } // Attempt to clear by known patterns if possible
    catch (e) { Logger.log(`⚠️ ${CONTEXT}: Cache clear warning: ${e.message}`); }

    results.success = results.errors.length === 0;
    results.message = results.success ? 
      `Cleanup successful: ${results.sheetsDeleted.length} other sheets deleted/cleared, ${results.propertiesCleared} properties cleared.` : 
      `Cleanup completed with ${results.errors.length} errors: ${results.errors.join('; ')}`;
    Logger.log(`${CONTEXT}: ${results.message}`);
    return results;
  } catch (e) { 
    const criticalErrorMsg = `Critical unhandled error in data cleanup: ${e.message}`;
    results.success = false; results.errors.push(criticalErrorMsg); results.message = criticalErrorMsg; 
    Logger.log(`❌❌ CRITICAL UNHANDLED error in ${CONTEXT} (outer catch): ${e.message}\nStack: ${e.stack}`);
    return results; 
  }
}

function removeTemporarySheet() {
    const CONTEXT = "MasterSheetManager.removeTemporarySheet";
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const tempSheet = ss.getSheetByName('Temporary');
        if (tempSheet && ss.getSheets().length > 1) { // Only delete if it's not the last sheet
            ss.deleteSheet(tempSheet);
            Logger.log(`${CONTEXT}: Temporary sheet removed.`);
            return createSuccessResponse({}, "Temporary sheet removed.");
        } else if (tempSheet) {
            Logger.log(`${CONTEXT}: Temporary sheet is the only sheet, not removed.`);
            return createSuccessResponse({notRemoved: true}, "Temporary sheet is the only sheet, not removed.");
        }
        return createSuccessResponse({notFound: true}, "Temporary sheet not found.");
    } catch (e) {
        return handleError(e, CONTEXT);
    }
}

function setupFreshDatabase() {
  const CONTEXT = "MasterSheetManager.setupFreshDatabase";
  try {
    Logger.log(`=== ${CONTEXT}: STARTING FRESH DATABASE SETUP ===`);
    
    const cleanupResult = completeDataCleanup(); 
    if (!cleanupResult || !cleanupResult.success) { 
        const errMessage = `CRITICAL FAILURE: completeDataCleanup failed: ${cleanupResult.message}`;
        Logger.log(`❌ ${CONTEXT}: ${errMessage}`);
        return createErrorResponse(errMessage, {rawResult: cleanupResult}); 
    }
    
    const createResult = createMasterSheetStructure(); 
    if (!createResult.success) {
      return createErrorResponse(`Database creation failed: ${createResult.message}`, createResult);
    }
    
    // === START MODIFICATION ===
    // Call our new, dedicated function to set the database ID.
    const dbIdResult = initializeDatabaseId();
    if (!dbIdResult.success) {
      // Log a warning but don't halt the entire process
      Logger.log(`⚠️ WARNING: Could not initialize database ID. Message: ${dbIdResult.message}`);
    }
    // === END MODIFICATION ===

    removeTemporarySheet(); 
    
    let protectionResult = { success: true, message: "CellProtection not found/called." };
    if (typeof installCompleteProtection === 'function') { 
        protectionResult = installCompleteProtection();
        if (!protectionResult.success) Logger.log(`⚠️ ${CONTEXT}: Protection installation issues: ${protectionResult.message}`);
    }

    Logger.log(`✅ ${CONTEXT}: Clean database framework setup completed.`);
    return createSuccessResponse({
      cleanup: cleanupResult, 
      creation: createResult, 
      protection: protectionResult,
      summary: `Cleanup: ${cleanupResult.success}, Creation: ${createResult.success}, Protection: ${protectionResult.success}`
    }, "Clean database framework setup completed.");
    
  } catch (e) { return handleError(e, CONTEXT); }
}