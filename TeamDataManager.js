/**
 * Schedule Manager - Team Data Manager
 *
 * @version 1.4.1 (2025-06-07) - FIXED: Triple prefix bug in generateTeamId
 * @version 1.4.0 (2025-05-31) - Implemented Caching for getTeamData and invalidation.
 * @version 1.3.1 (2025-05-30) - Phase 1D Refactor (Permissions Updated)
 * @version 1.3.0 (2025-05-30) - Phase 1D: Refined deleteTeam to archiveTeam, added hardDeleteArchivedTeam, added division validation.
 * @version 1.2.0 (2025-05-30) - Phase 1C: Added permission enforcement, logo URL support, updated Teams schema.
 * @version 1.1.0 (2025-05-29) - Initial implementation with web app database architecture.
 */

// Assumes global constants: ROLES, PERMISSIONS, BLOCK_CONFIG
// Assumes global functions from Configuration.js: createErrorResponse, createSuccessResponse, handleError, validateTeamName, isValidEmail, validateLogoUrl, getCurrentTimestamp, formatDate
// Assumes global functions from CellProtection.js: withProtectionBypass, removeTeamSheetProtection, autoProtectNewTeamSheet
// Assumes global functions from PermissionManager.js: userHasPermission
// Assumes global functions from PlayerDataManager.js: disassociatePlayersFromTeam, updateTeamDetailsInPlayerRecords
// Assumes global functions from MasterSheetManager.js: _msm_createTeamTab
// Assumes global functions from WeekBlockManager.js: ensureWeekExists, getMondayFromWeekNumberAndYear, getISOWeekNumber

const TEAM_DATA_CACHE_EXPIRATION_SECONDS = 300; // 5 minutes (300 seconds)

// =============================================================================
// TEAM CRUD OPERATIONS
// =============================================================================

function createTeam(teamData, requestingUserEmail) {
  const CONTEXT = "TeamDataManager.createTeam";
  try {
    const validation = validateTeamCreationData(teamData); // Local helper
    if (!validation.isValid) {
      return createErrorResponse(
        `Team validation failed: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (!teamsSheet) {
      return createErrorResponse("Teams database not found. Run master sheet setup first.");
    }

    const existingTeams = teamsSheet.getDataRange().getValues();
    const tNameColIdx = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS.TEAM_NAME;
    const isActiveColIdx = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS.IS_ACTIVE;
    if (existingTeams.slice(1).some(row => row[tNameColIdx].toLowerCase() === teamData.teamName.toLowerCase() && row[isActiveColIdx])) {
        return createErrorResponse(`An active team named "${teamData.teamName}" already exists.`);
    }

    const teamId = generateTeamId(teamData.teamName); // Local helper
    const joinCode = generateJoinCode(teamId); // Local helper
    const availabilitySheetName = teamId;

    const tabCreationResult = _msm_createTeamTab(ss, availabilitySheetName, teamData.teamName);
    if (!tabCreationResult.success) {
      return createErrorResponse(`Failed to create team availability sheet: ${tabCreationResult.message}`);
    }

    const teamSheet = ss.getSheetByName(availabilitySheetName);
    if (teamSheet) {
        const currentCetDate = getCurrentCETDate();
        const currentYear = currentCetDate.getFullYear();
        const currentWeekNum = getISOWeekNumber(currentCetDate);
        const weeksToProvisionInitially = BLOCK_CONFIG.TEAM_SETTINGS.MAX_WEEKS_PER_TEAM || 2;
        let yearToProcess = currentYear;
        let weekToProcess = currentWeekNum;
        for (let i = 0; i < weeksToProvisionInitially; i++) {
            ensureWeekExists(teamSheet, yearToProcess, weekToProcess);
            const monday = getMondayFromWeekNumberAndYear(yearToProcess, weekToProcess);
            const nextMonday = new Date(monday);
            nextMonday.setDate(monday.getDate() + 7);
            yearToProcess = nextMonday.getFullYear();
            weekToProcess = getISOWeekNumber(nextMonday);
        }
    }

    if (BLOCK_CONFIG.TEAM_SETTINGS.AUTO_CREATE_TEAM_TAB && BLOCK_CONFIG.SETTINGS.AUTO_PROTECT_NEW_TEAMS) {
      autoProtectNewTeamSheet(availabilitySheetName);
    }

    const newTeamRow = [];
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    newTeamRow[tCols.TEAM_ID] = teamId;
    newTeamRow[tCols.TEAM_NAME] = teamData.teamName.trim();
    newTeamRow[tCols.DIVISION] = teamData.division;
    newTeamRow[tCols.LEADER_EMAIL] = teamData.leaderEmail.toLowerCase();
    newTeamRow[tCols.JOIN_CODE] = joinCode;
    newTeamRow[tCols.CREATED_DATE] = getCurrentTimestamp();
    newTeamRow[tCols.LAST_ACTIVE] = getCurrentTimestamp();
    newTeamRow[tCols.MAX_PLAYERS] = teamData.maxPlayers || BLOCK_CONFIG.TEAM_SETTINGS.MAX_PLAYERS_PER_TEAM;
    newTeamRow[tCols.IS_ACTIVE] = true;
    newTeamRow[tCols.IS_PUBLIC] = typeof teamData.isPublic === 'boolean' ? teamData.isPublic : true;
    newTeamRow[tCols.PLAYER_COUNT] = 0;
    newTeamRow[tCols.PLAYER_LIST] = "";
    newTeamRow[tCols.INITIALS_LIST] = "";
    newTeamRow[tCols.AVAILABILITY_SHEET_NAME] = availabilitySheetName;
    newTeamRow[tCols.LOGO_URL] = teamData.logoUrl || "";

    const appendResult = withProtectionBypass(() => {
      teamsSheet.appendRow(newTeamRow);
      return true;
    }, "Append New Team", BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (!appendResult) {
        const sheetToDelete = ss.getSheetByName(availabilitySheetName);
        if (sheetToDelete) ss.deleteSheet(sheetToDelete);
        return createErrorResponse("Failed to append team data to Teams sheet after protection bypass.");
    }
    
    // === START: ADDED CACHE LOGIC ===
    try {
      const cacheSheet = ss.getSheetByName('SYSTEM_CACHE');
      if (cacheSheet) {
        const cacheRow = [
          teamId,
          teamData.teamName.trim(),
          teamData.division,
          teamData.logoUrl || "",
          typeof teamData.isPublic === 'boolean' ? teamData.isPublic : true,
          "[]" // RosterJSON starts as an empty array
        ];
        cacheSheet.appendRow(cacheRow);
        cacheSheet.getRange('G1').setValue(getCurrentTimestamp()); // Update master timestamp
      }
    } catch (cacheError) {
      Logger.log(`${CONTEXT}: WARNING - Failed to update SYSTEM_CACHE after creating team ${teamId}. Error: ${cacheError.message}`);
      // Do not fail the entire operation for a cache write failure, just log it.
    }
    // === END: ADDED CACHE LOGIC ===

    const createdTeamData = mapTeamRowToObject(newTeamRow, tCols); // Local helper
    return createSuccessResponse({ team: createdTeamData }, `Team "${teamData.teamName}" created successfully. Join Code: ${joinCode}`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function getTeamData(teamId, includeInactive = false) {
  const CONTEXT = "TeamDataManager.getTeamData";
  const cache = CacheService.getScriptCache();
  // Cache key needs to account for 'includeInactive' to prevent serving wrong data version
  const cacheKey = `teamData_${teamId}_incInactive_${includeInactive}`;

  try {
    const cached = cache.get(cacheKey);
    if (cached !== null) {
      // Logger.log(`${CONTEXT}: Cache HIT for ${cacheKey}`);
      return JSON.parse(cached);
    }

    // Logger.log(`${CONTEXT}: Cache MISS for ${cacheKey}. Fetching from sheet for team ${teamId}`);
    const teamsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (!teamsSheet) {
        Logger.log(`${CONTEXT}: Teams sheet not found.`);
        return null;
    }

    const data = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;

    for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
      const row = data[i];
      if (row[tCols.TEAM_ID] === teamId) {
        if (!includeInactive && !row[tCols.IS_ACTIVE]) {
          // Logger.log(`${CONTEXT}: Team ${teamId} found but is inactive and includeInactive is false.`);
          // Do not cache this specific "found but not returned due to filter" case,
          // as the other cache key (e.g. with includeInactive=true) might be valid.
          return null;
        }
        const teamObject = mapTeamRowToObject(row, tCols); // Local helper
        cache.put(cacheKey, JSON.stringify(teamObject), TEAM_DATA_CACHE_EXPIRATION_SECONDS);
        // Logger.log(`${CONTEXT}: Stored ${cacheKey} in cache with data: ${JSON.stringify(teamObject)}`);
        return teamObject;
      }
    }
    // Logger.log(`${CONTEXT}: Team ${teamId} not found in sheet.`);
    // Cache "not found" for a short period to prevent rapid re-scanning for non-existent IDs
    cache.put(cacheKey, JSON.stringify(null), Math.floor(TEAM_DATA_CACHE_EXPIRATION_SECONDS / 5)); // Shorter cache for null results
    return null;
  } catch (e) {
    Logger.log(`Error in ${CONTEXT} for team ${teamId}: ${e.message}`);
    return null; // Don't cache errors, let them be retried
  }
}

function _invalidateTeamCache(teamId) {
    const CONTEXT = "TeamDataManager._invalidateTeamCache";
    if (!teamId) return;
    const cache = CacheService.getScriptCache();
    const cacheKeyActive = `teamData_${teamId}_incInactive_false`;
    const cacheKeyInactive = `teamData_${teamId}_incInactive_true`;
    cache.remove(cacheKeyActive);
    cache.remove(cacheKeyInactive);
    // Logger.log(`${CONTEXT}: Cleared cache for team ${teamId} (keys: ${cacheKeyActive}, ${cacheKeyInactive}).`);
}


function getAllTeams(onlyActive = true) {
    const CONTEXT = "TeamDataManager.getAllTeams";
    try {
        const teamsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
        if (!teamsSheet) {
            return createErrorResponse("Teams sheet not found.");
        }
        const data = teamsSheet.getDataRange().getValues();
        const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
        const teams = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (onlyActive && !row[tCols.IS_ACTIVE]) {
                continue;
            }
            teams.push(mapTeamRowToObject(row, tCols)); // Local helper
        }
        return createSuccessResponse({ teams: teams }, `Retrieved ${teams.length} teams.`);
    } catch (e) {
        return handleError(e, CONTEXT);
    }
}

function updateTeam(teamId, updates, requestingUserEmail) {
  const CONTEXT = "TeamDataManager.updateTeam";
  let finalTeamData = null;
  try {
    const teamDataForPermCheck = getTeamData(teamId, true); // Uses caching
    if (!teamDataForPermCheck) {
      return createErrorResponse(`Team not found: ${teamId}`);
    }

    const hasAdminPerm = userHasPermission(requestingUserEmail, PERMISSIONS.MANAGE_ALL_TEAMS);
    const isLeader = teamDataForPermCheck.leaderEmail.toLowerCase() === requestingUserEmail.toLowerCase();
    if (!hasAdminPerm && !(isLeader && userHasPermission(requestingUserEmail, PERMISSIONS.EDIT_OWN_TEAM_DETAILS, teamId))) {
         return createErrorResponse("Permission denied: You must be an Admin or Team Leader of this team to update its details.");
    }
    if (updates.hasOwnProperty('isActive') && updates.isActive === false && isLeader && !hasAdminPerm) {
        return createErrorResponse("Team Leaders should use the 'Archive Team' option. Only Admins can directly set IsActive to false here.");
    }

    const validation = validateTeamUpdateData(updates); // Local helper
    if (!validation.isValid) {
      return createErrorResponse(`Team update validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (!teamsSheet) return createErrorResponse("Teams sheet not found.");

    const sheetData = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    let teamRowIndex = -1;
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][tCols.TEAM_ID] === teamId) {
        teamRowIndex = i;
        break;
      }
    }
    if (teamRowIndex === -1) return createErrorResponse(`Team not found in sheet for update: ${teamId}`);

    let teamNameChanged = false;
    let divisionChanged = false;

    const updatePerformed = withProtectionBypass(() => {
      let updated = false;
      const actualRowSheetIndex = teamRowIndex + 1;
      // ... (all the if (updates.hasOwnProperty(...)) blocks as before)
      if (updates.hasOwnProperty('teamName')) {
        const newNameTrimmed = updates.teamName.trim();
        if (validateTeamName(newNameTrimmed).isValid) {
            if (sheetData[teamRowIndex][tCols.TEAM_NAME].toLowerCase() !== newNameTrimmed.toLowerCase()) {
                const isDuplicate = sheetData.slice(1).some((row, idx) =>
                    idx !== teamRowIndex && row[tCols.TEAM_NAME].toLowerCase() === newNameTrimmed.toLowerCase() && row[tCols.IS_ACTIVE]);
                if (isDuplicate) throw new Error(`Another active team with the name "${newNameTrimmed}" already exists.`);
                teamNameChanged = true;
            }
            teamsSheet.getRange(actualRowSheetIndex, tCols.TEAM_NAME + 1).setValue(newNameTrimmed);
            updated = true;
        }
      }
      if (updates.hasOwnProperty('division') && BLOCK_CONFIG.TEAM_SETTINGS.ALLOWED_DIVISIONS.includes(String(updates.division))) {
        if(sheetData[teamRowIndex][tCols.DIVISION] !== String(updates.division)) divisionChanged = true;
        teamsSheet.getRange(actualRowSheetIndex, tCols.DIVISION + 1).setValue(updates.division);
        updated = true;
      }
      if (updates.hasOwnProperty('logoUrl')) {
        const logoUrlValidation = validateLogoUrl(updates.logoUrl);
        if (!logoUrlValidation.isValid) throw new Error(logoUrlValidation.errors.join(', '));
        teamsSheet.getRange(actualRowSheetIndex, tCols.LOGO_URL + 1).setValue(updates.logoUrl || "");
        updated = true;
      }
      if (updates.hasOwnProperty('maxPlayers') && Number.isInteger(updates.maxPlayers) && updates.maxPlayers > 0 && updates.maxPlayers <= 20) {
        teamsSheet.getRange(actualRowSheetIndex, tCols.MAX_PLAYERS + 1).setValue(updates.maxPlayers);
        updated = true;
      }
      if (updates.hasOwnProperty('isPublic') && typeof updates.isPublic === 'boolean') {
        teamsSheet.getRange(actualRowSheetIndex, tCols.IS_PUBLIC + 1).setValue(updates.isPublic);
        updated = true;
      }
       if (updates.hasOwnProperty('isActive') && typeof updates.isActive === 'boolean') {
         if (!hasAdminPerm && updates.isActive === true && sheetData[teamRowIndex][tCols.IS_ACTIVE] === false) {
            throw new Error("Only Admins can reactivate an archived team.");
         }
         teamsSheet.getRange(actualRowSheetIndex, tCols.IS_ACTIVE + 1).setValue(updates.isActive);
         updated = true;
         if(updates.isActive === false && sheetData[teamRowIndex][tCols.IS_ACTIVE] === true){
            disassociatePlayersFromTeam(teamId, "Team Deactivated by Admin");
            const currentAvailSheetName = sheetData[teamRowIndex][tCols.AVAILABILITY_SHEET_NAME];
            const archivedSheetName = `${currentAvailSheetName}_ARCHIVED_${formatDate(new Date(), "YYYYMMDD")}`;
            const teamAvailSheet = ss.getSheetByName(currentAvailSheetName);
            if(teamAvailSheet) {
                removeTeamSheetProtection(currentAvailSheetName);
                teamAvailSheet.setName(archivedSheetName.substring(0,100));
                teamsSheet.getRange(actualRowSheetIndex, tCols.AVAILABILITY_SHEET_NAME + 1).setValue(archivedSheetName.substring(0,100));
            }
         }
      }
      if (updated) {
        teamsSheet.getRange(actualRowSheetIndex, tCols.LAST_ACTIVE + 1).setValue(getCurrentTimestamp());
      }
      return updated;
    }, "Update Team Data", BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (updatePerformed && updatePerformed.success === false) return updatePerformed;
    if (updatePerformed === false) return createErrorResponse("No valid changes applied or update failed.", {noChanges: true});
    if (updatePerformed === null || typeof updatePerformed === 'undefined') return createErrorResponse("Failed to update team: Unknown error.");

    _invalidateTeamCache(teamId); // Call local helper
    finalTeamData = getTeamData(teamId, true); // Re-fetch to ensure response has latest & re-cache

    if (finalTeamData && (teamNameChanged || divisionChanged)) {
        updateTeamDetailsInPlayerRecords(teamId, finalTeamData.teamName, finalTeamData.division);
    }
    return createSuccessResponse({ team: finalTeamData }, `Team "${finalTeamData.teamName}" updated successfully.`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function archiveTeam(teamId, requestingUserEmail) {
  const CONTEXT = "TeamDataManager.archiveTeam";
  try {
    const teamData = getTeamData(teamId, true); // Uses caching
    if (!teamData) return createErrorResponse(`Team not found: ${teamId}`);

    const hasAdminPerm = userHasPermission(requestingUserEmail, PERMISSIONS.MANAGE_ALL_TEAMS);
    const isLeader = isUserTeamLeader(requestingUserEmail, teamId); // Local helper
    if (!hasAdminPerm && !isLeader) return createErrorResponse("Permission denied to archive team.");
    if (!teamData.isActive) return createSuccessResponse({ teamId: teamId, alreadyArchived: true }, `Team ${teamData.teamName} is already inactive.`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    const sheetDataValues = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    const teamRowArrayIndex = sheetDataValues.findIndex(row => row[tCols.TEAM_ID] === teamId);
    const teamRowSheetIndex = teamRowArrayIndex + 1;
    if (teamRowArrayIndex === -1) return createErrorResponse(`Team ${teamId} consistency error.`);

    const availabilitySheetName = teamData.availabilitySheetName;
    const archivedSheetNameSuffix = `_ARCHIVED_${formatDate(new Date(), "YYYYMMDD")}`;
    let potentialArchivedSheetName = availabilitySheetName + archivedSheetNameSuffix;
    if (potentialArchivedSheetName.length > 100) {
        potentialArchivedSheetName = availabilitySheetName.substring(0, 100 - archivedSheetNameSuffix.length -1) + "…" + archivedSheetNameSuffix;
    }
    const finalArchivedSheetName = potentialArchivedSheetName;

    const archiveOperationResult = withProtectionBypass(() => {
      teamsSheet.getRange(teamRowSheetIndex, tCols.IS_ACTIVE + 1).setValue(false);
      teamsSheet.getRange(teamRowSheetIndex, tCols.LAST_ACTIVE + 1).setValue(getCurrentTimestamp());
      let sheetRenamed = false;
      if (availabilitySheetName) {
        const teamAvailSheet = ss.getSheetByName(availabilitySheetName);
        if (teamAvailSheet) {
          try {
            removeTeamSheetProtection(availabilitySheetName);
            teamAvailSheet.setName(finalArchivedSheetName);
            teamsSheet.getRange(teamRowSheetIndex, tCols.AVAILABILITY_SHEET_NAME + 1).setValue(finalArchivedSheetName);
            sheetRenamed = true;
          } catch (renameError) { Logger.log(`${CONTEXT}: Error renaming sheet ${availabilitySheetName}: ${renameError.message}.`); }
        }
      }
      const disassociateResult = disassociatePlayersFromTeam(teamId, "Team Archived");
      if (!disassociateResult.success) Logger.log(`${CONTEXT}: Player disassociation warning: ${disassociateResult.message}`);
      
      // === START: ADDED CACHE LOGIC ===
      const cacheSheet = ss.getSheetByName('SYSTEM_CACHE');
      if (cacheSheet) {
        const teamIdsInData = cacheSheet.getRange('A2:A').getValues().flat();
        const rowIndexInCache = teamIdsInData.indexOf(teamId);
        if (rowIndexInCache !== -1) {
          cacheSheet.deleteRow(rowIndexInCache + 2);
          cacheSheet.getRange('G1').setValue(getCurrentTimestamp()); // Update master timestamp
        }
      }
      // === END: ADDED CACHE LOGIC ===

      return { success: true, sheetRenamed: sheetRenamed, finalArchivedSheetName: finalArchivedSheetName };
    }, "Archive Team Operations", BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (!archiveOperationResult || !archiveOperationResult.success) {
        return createErrorResponse("Failed to archive team: An error occurred.");
    }
    _invalidateTeamCache(teamId); // Call local helper
    return createSuccessResponse({
        teamId: teamId, teamName: teamData.teamName,
        archivedSheetName: archiveOperationResult.finalArchivedSheetName,
        sheetWasRenamed: archiveOperationResult.sheetRenamed
    }, `Team ${teamData.teamName} (${teamId}) archived successfully.`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function hardDeleteArchivedTeam(teamId, requestingUserEmail) {
  const CONTEXT = "TeamDataManager.hardDeleteArchivedTeam";
  try {
    if (!userHasPermission(requestingUserEmail, PERMISSIONS.MANAGE_ALL_TEAMS)) {
         return createErrorResponse("Permission denied: Only Admins can permanently delete archived teams.");
    }
    const teamData = getTeamData(teamId, true); // Uses caching
    if (!teamData) return createErrorResponse(`Team not found: ${teamId}`);
    if (teamData.isActive) return createErrorResponse(`Team "${teamData.teamName}" is still active. Archive first.`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (!teamsSheet) return createErrorResponse("Teams sheet not found.");

    const sheetDataValues = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    const teamRowIndexInArray = sheetDataValues.findIndex(row => row[tCols.TEAM_ID] === teamId);
    if (teamRowIndexInArray === -1) return createErrorResponse(`Team ${teamId} not found in sheet for hard delete.`);
    const teamRowSheetIndex = teamRowIndexInArray + 1;
    const availabilitySheetName = teamData.availabilitySheetName;

    let sheetActuallyDeleted = false;
    if (availabilitySheetName) {
        const teamAvailSheet = ss.getSheetByName(availabilitySheetName);
        if (teamAvailSheet) {
            try {
                removeTeamSheetProtection(availabilitySheetName);
                ss.deleteSheet(teamAvailSheet);
                sheetActuallyDeleted = true;
            } catch(sheetDeleteError){ Logger.log(`${CONTEXT}: Error deleting sheet ${availabilitySheetName}: ${sheetDeleteError.message}.`); }
        }
    }

    const deleteRowResult = withProtectionBypass(() => {
      teamsSheet.deleteRow(teamRowSheetIndex);
      return true;
    }, "Delete Team Row", BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (!deleteRowResult) return createErrorResponse("Failed to delete team row from Teams sheet.");

    _invalidateTeamCache(teamId); // Call local helper
    return createSuccessResponse({
        teamId: teamId, teamName: teamData.teamName,
        deletedSheetName: availabilitySheetName, sheetWasDeleted: sheetActuallyDeleted
    }, `Team ${teamData.teamName} (${teamId}) and its data permanently deleted.`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function regenerateJoinCode(teamId, requestingUserEmail) {
  const CONTEXT = "TeamDataManager.regenerateJoinCode";
  try {
    const teamData = getTeamData(teamId, true); // Uses caching
    if (!teamData) return createErrorResponse(`Team not found: ${teamId}`);

    const hasAdminPerm = userHasPermission(requestingUserEmail, PERMISSIONS.MANAGE_ALL_TEAMS);
    const isLeader = isUserTeamLeader(requestingUserEmail, teamId); // Local helper
    if (!hasAdminPerm && !isLeader) return createErrorResponse("Permission denied to regenerate join code.");
    if (!teamData.isActive) return createErrorResponse(`Cannot regenerate join code for inactive team: "${teamData.teamName}".`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (!teamsSheet) return createErrorResponse("Teams sheet not found.");

    const sheetDataValues = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    const teamRowIndexInArray = sheetDataValues.findIndex(row => row[tCols.TEAM_ID] === teamId);
    if (teamRowIndexInArray === -1) return createErrorResponse(`Team ${teamId} not found in sheet.`);
    const teamRowSheetIndex = teamRowIndexInArray + 1;

    const newJoinCode = generateJoinCode(teamData.teamName || teamId); // Local helper
    const updatePerformed = withProtectionBypass(() => {
      teamsSheet.getRange(teamRowSheetIndex, tCols.JOIN_CODE + 1).setValue(newJoinCode);
      teamsSheet.getRange(teamRowSheetIndex, tCols.LAST_ACTIVE + 1).setValue(getCurrentTimestamp());
      return true;
    }, "Regenerate Join Code", BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);

    if (!updatePerformed) return createErrorResponse("Failed to regenerate join code.");

    _invalidateTeamCache(teamId); // Call local helper
    return createSuccessResponse({ teamId: teamId, teamName: teamData.teamName, newJoinCode: newJoinCode }, "Join code regenerated.");
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

// =============================================================================
// UTILITY & VALIDATION FUNCTIONS (Local Helpers)
// =============================================================================
function generateTeamId(teamName) {
  const cleanName = teamName.replace(/[^A-Za-z0-9]/g, '');
  return `${BLOCK_CONFIG.MASTER_SHEET.TEAM_TAB_PREFIX}${cleanName}_${Utilities.getUuid().substring(0, 8)}`;
}

function generateJoinCode(teamIdOrName) {
    let base = String(teamIdOrName).replace(BLOCK_CONFIG.MASTER_SHEET.TEAM_TAB_PREFIX, "");
    base = base.substring(0, BLOCK_CONFIG.TEAM_SETTINGS.JOIN_CODE_PREFIX_LENGTH).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (base.length < 2) base = "TEAM";
    const suffixLength = BLOCK_CONFIG.TEAM_SETTINGS.JOIN_CODE_SUFFIX_LENGTH || 4;
    const randomSuffix = Math.random().toString(36).substring(2, 2 + suffixLength).toUpperCase();
    return base + randomSuffix;
}

function validateJoinCode(joinCode) {
  const CONTEXT = "TeamDataManager.validateJoinCode";
  try {
    if (!isValidJoinCodeFormat(joinCode)) {
      return { isValid: false, message: "Invalid join code format." };
    }
    const teamsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    if (!teamsSheet) return { isValid: false, message: "Teams database not available." };

    const data = teamsSheet.getDataRange().getValues();
    const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
    const lcJoinCode = joinCode.toUpperCase();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[tCols.JOIN_CODE] && row[tCols.JOIN_CODE].toUpperCase() === lcJoinCode) {
        if (!row[tCols.IS_ACTIVE]) {
          return { isValid: false, message: `Team "${row[tCols.TEAM_NAME]}" is currently inactive.` };
        }
        // Use mapTeamRowToObject to get consistent team object with correct types for playerCount/maxPlayers
        const teamObject = mapTeamRowToObject(row, tCols);
        if (teamObject.playerCount >= teamObject.maxPlayers) {
          return { isValid: false, message: `Team "${teamObject.teamName}" is full (${teamObject.playerCount}/${teamObject.maxPlayers} players).` };
        }
        return { isValid: true, teamData: teamObject };
      }
    }
    return { isValid: false, message: "Join code not found." };
  } catch (e) {
    Logger.log(`Error in ${CONTEXT}: ${e.message}`);
    return { isValid: false, message: `Error validating join code: ${e.message}` };
  }
}

function validateTeamCreationData(teamData) {
  const errors = [];
  const nameValidation = validateTeamName(teamData.teamName);
  if (!nameValidation.isValid) errors.push(...nameValidation.errors);

  if (!teamData.division || !BLOCK_CONFIG.TEAM_SETTINGS.ALLOWED_DIVISIONS.includes(String(teamData.division))) {
    errors.push(`Division must be one of: ${BLOCK_CONFIG.TEAM_SETTINGS.ALLOWED_DIVISIONS.join(', ')}.`);
  }
  if (!teamData.leaderEmail || !isValidEmail(teamData.leaderEmail)) {
    errors.push("Valid leader email is required.");
  }
  const maxPlayers = teamData.maxPlayers || BLOCK_CONFIG.TEAM_SETTINGS.MAX_PLAYERS_PER_TEAM;
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 20) {
    errors.push("Max players must be a whole number between 1 and 20.");
  }
   if (teamData.hasOwnProperty('isPublic') && typeof teamData.isPublic !== 'boolean') {
    errors.push("Is Public setting must be true or false.");
  }
  if (teamData.hasOwnProperty('logoUrl')) {
      const logoUrlValidation = validateLogoUrl(teamData.logoUrl);
      if (!logoUrlValidation.isValid) errors.push(...logoUrlValidation.errors);
  }
  return { isValid: errors.length === 0, errors: errors };
}

function validateTeamUpdateData(updates) {
  const errors = [];
  if (updates.hasOwnProperty('teamName')) {
    const nameValidation = validateTeamName(updates.teamName);
    if (!nameValidation.isValid) errors.push(...nameValidation.errors);
  }
  if (updates.hasOwnProperty('division') && !BLOCK_CONFIG.TEAM_SETTINGS.ALLOWED_DIVISIONS.includes(String(updates.division))) {
    errors.push(`Division must be one of: ${BLOCK_CONFIG.TEAM_SETTINGS.ALLOWED_DIVISIONS.join(', ')}.`);
  }
  if (updates.hasOwnProperty('maxPlayers') && (!Number.isInteger(updates.maxPlayers) || updates.maxPlayers < 1 || updates.maxPlayers > 20)) {
     errors.push("Max players must be a whole number between 1 and 20.");
  }
  if (updates.hasOwnProperty('isPublic') && typeof updates.isPublic !== 'boolean') {
    errors.push("Is Public setting must be true or false.");
  }
  if (updates.hasOwnProperty('isActive') && typeof updates.isActive !== 'boolean') {
    errors.push("Is Active setting must be true or false.");
  }
  if (updates.hasOwnProperty('logoUrl')) {
      const logoUrlValidation = validateLogoUrl(updates.logoUrl);
      if (!logoUrlValidation.isValid) {
          errors.push(...logoUrlValidation.errors);
      }
  }
  return { isValid: errors.length === 0, errors: errors };
}

function isUserTeamLeader(userEmail, teamId) {
    if (!userEmail || !teamId) return false;
    const teamData = getTeamData(teamId); // Uses caching now
    return teamData && teamData.isActive && teamData.leaderEmail.toLowerCase() === userEmail.toLowerCase();
}

function mapTeamRowToObject(row, tCols) {
    return {
        teamId: row[tCols.TEAM_ID],
        teamName: row[tCols.TEAM_NAME],
        division: row[tCols.DIVISION],
        leaderEmail: row[tCols.LEADER_EMAIL],
        joinCode: row[tCols.JOIN_CODE],
        createdDate: row[tCols.CREATED_DATE],
        lastActive: row[tCols.LAST_ACTIVE],
        maxPlayers: parseInt(row[tCols.MAX_PLAYERS]) || 0,
        isActive: row[tCols.IS_ACTIVE] === true, // Ensure boolean
        isPublic: row[tCols.IS_PUBLIC] === true, // Ensure boolean
        playerCount: parseInt(row[tCols.PLAYER_COUNT]) || 0,
        playerList: row[tCols.PLAYER_LIST] ? String(row[tCols.PLAYER_LIST]).split(',').filter(name => name.trim() !== '') : [],
        initialsList: row[tCols.INITIALS_LIST] ? String(row[tCols.INITIALS_LIST]).split(',').filter(initial => initial.trim() !== '') : [],
        availabilitySheetName: row[tCols.AVAILABILITY_SHEET_NAME],
        logoUrl: row[tCols.LOGO_URL] || ""
    };
}