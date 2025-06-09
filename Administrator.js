/**
 * Schedule Manager - Administrator Service (Web App Edition)
 *
 * @version 1.2.2 (2025-05-31) - Corrected use of withProtectionBypass to withMultiSheetBypass for multiple sheets.
 * @version 1.2.1 (2025-05-31) - Added PlayerDataManager cache invalidation.
 * @version 1.2.0 (2025-05-31) - Added TeamDataManager cache invalidation.
 * @version 1.1.0 (2025-05-31) - Refactored core_adminSetTeamLeader
 * @version 1.0.0 (2025-05-30) - Phase 1D
 *
 * Description: Handles administrator-only operations.
 * core_adminSetTeamLeader allows an Admin or current Team Leader to set/change team leader.
 */

// Assumes global constants: ROLES, PERMISSIONS, BLOCK_CONFIG
// Assumes global functions from Configuration.js: createErrorResponse, createSuccessResponse, isValidEmail, getCurrentTimestamp, handleError
// Assumes global functions from PermissionManager.js: userHasPermission, clearUserRoleCache
// Assumes global functions from TeamDataManager.js: isUserTeamLeader
// Assumes global functions from PlayerDataManager.js: getPlayerDataByEmail, _pdm_invalidatePlayerCache (if we make helper global or replicate logic)
// Assumes global function from CellProtection.js: withProtectionBypass, withMultiSheetBypass


// =============================================================================
// HELPER FUNCTIONS for core_adminSetTeamLeader
// =============================================================================

function _as_validateSetLeaderPermissionsAndInputs(teamId, newLeaderUserEmail, requestingUserEmail) {
  const isGlobalAdmin = userHasPermission(requestingUserEmail, PERMISSIONS.ASSIGN_TEAM_LEADER);
  const isCurrentLeaderOfThisTeam = isUserTeamLeader(requestingUserEmail, teamId);

  if (!isGlobalAdmin && !isCurrentLeaderOfThisTeam) {
    return createErrorResponse("Permission denied: You must be an Administrator or the current Team Leader of this team to perform this action.");
  }
  if (!teamId || !newLeaderUserEmail || !isValidEmail(newLeaderUserEmail)) {
    return createErrorResponse("Invalid input: Team ID and a valid new leader email are required.");
  }
  return { success: true };
}

function _as_getTeamAndLeaderDetails(teamId, newLeaderUserEmail, teamsSheet, playersSheet) {
  const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
  const pCols = BLOCK_CONFIG.MASTER_SHEET.PLAYERS_COLUMNS;

  const teamsData = teamsSheet.getDataRange().getValues();
  const teamRowIndex = teamsData.findIndex(row => row[tCols.TEAM_ID] === teamId && row[tCols.IS_ACTIVE]);

  if (teamRowIndex === -1) {
    return createErrorResponse(`Team not found or is inactive: ${teamId}`);
  }
  const currentTeamDataRow = teamsData[teamRowIndex];
  const oldLeaderEmailOnTeamsSheet = currentTeamDataRow[tCols.LEADER_EMAIL];

  const playersData = playersSheet.getDataRange().getValues();
  let newLeaderPlayerRowDataIndex = -1;
  let oldLeaderPlayerRowDataIndex = -1;
  let newLeaderCurrentTeamSlot = null;
  let oldLeaderPlayerCurrentTeamSlot = null;
  let newLeaderCurrentRoleInSlot = null;
  let newLeaderPlayerId = null; // To store Player ID for cache invalidation
  let oldLeaderPlayerId = null; // To store Player ID for cache invalidation


  for (let i = 1; i < playersData.length; i++) {
    const playerRow = playersData[i];
    const playerEmail = playerRow[pCols.GOOGLE_EMAIL];
    const playerIsActive = playerRow[pCols.IS_ACTIVE];

    if (playerEmail.toLowerCase() === newLeaderUserEmail.toLowerCase() && playerIsActive) {
      newLeaderPlayerRowDataIndex = i;
      newLeaderPlayerId = playerRow[pCols.PLAYER_ID]; // Get PlayerID
      if (playerRow[pCols.TEAM1_ID] === teamId) {
        newLeaderCurrentTeamSlot = 'TEAM1';
        newLeaderCurrentRoleInSlot = playerRow[pCols.TEAM1_ROLE];
      } else if (playerRow[pCols.TEAM2_ID] === teamId) {
        newLeaderCurrentTeamSlot = 'TEAM2';
        newLeaderCurrentRoleInSlot = playerRow[pCols.TEAM2_ROLE];
      }
    }
    if (oldLeaderEmailOnTeamsSheet && playerEmail.toLowerCase() === oldLeaderEmailOnTeamsSheet.toLowerCase() && playerIsActive) {
      oldLeaderPlayerRowDataIndex = i;
      oldLeaderPlayerId = playerRow[pCols.PLAYER_ID]; // Get PlayerID
      if (playerRow[pCols.TEAM1_ID] === teamId) oldLeaderPlayerCurrentTeamSlot = 'TEAM1';
      else if (playerRow[pCols.TEAM2_ID] === teamId) oldLeaderPlayerCurrentTeamSlot = 'TEAM2';
    }
  }

  if (newLeaderPlayerRowDataIndex === -1) {
    return createErrorResponse(`New leader candidate ${newLeaderUserEmail} not found in player records or is inactive.`);
  }
  if (!newLeaderCurrentTeamSlot) {
    return createErrorResponse(`New leader candidate ${newLeaderUserEmail} is not an active member of team ${teamId}.`);
  }

  return {
    success: true,
    teamSheetRow: teamRowIndex + 1,
    oldLeaderEmailOnTeamsSheet: oldLeaderEmailOnTeamsSheet,
    newLeaderPlayerSheetRow: newLeaderPlayerRowDataIndex + 1,
    newLeaderCurrentTeamSlot: newLeaderCurrentTeamSlot,
    newLeaderCurrentRoleInSlot: newLeaderCurrentRoleInSlot,
    newLeaderPlayerId: newLeaderPlayerId, // Pass Player ID
    oldLeaderPlayerSheetRow: oldLeaderPlayerRowDataIndex !== -1 ? oldLeaderPlayerRowDataIndex + 1 : -1,
    oldLeaderPlayerCurrentTeamSlot: oldLeaderPlayerCurrentTeamSlot,
    oldLeaderPlayerId: oldLeaderPlayerId // Pass Player ID
  };
}

function _as_performLeaderSheetUpdates(details, newLeaderUserEmail, teamsSheet, playersSheet) {
  const CONTEXT_HELPER = "AdministratorService._as_performLeaderSheetUpdates";
  const tCols = BLOCK_CONFIG.MASTER_SHEET.TEAMS_COLUMNS;
  const pCols = BLOCK_CONFIG.MASTER_SHEET.PLAYERS_COLUMNS;

  Logger.log(`${CONTEXT_HELPER}: Updating sheets. New Leader PlayerSheetRow: ${details.newLeaderPlayerSheetRow}, Slot: ${details.newLeaderCurrentTeamSlot}, RoleValue: '${ROLES.TEAM_LEADER}'`);

  // CORRECTED: Using withMultiSheetBypass as we are operating on multiple sheets (Teams and Players)
  const updateResult = withMultiSheetBypass(() => {
    const newLeaderRoleCell = playersSheet.getRange(details.newLeaderPlayerSheetRow, pCols[`${details.newLeaderCurrentTeamSlot}_ROLE`] + 1);
    newLeaderRoleCell.setValue(ROLES.TEAM_LEADER);

    if (details.oldLeaderEmailOnTeamsSheet &&
        details.oldLeaderPlayerSheetRow !== -1 &&
        details.oldLeaderPlayerCurrentTeamSlot &&
        details.oldLeaderEmailOnTeamsSheet.toLowerCase() !== newLeaderUserEmail.toLowerCase()) {
      const oldLeaderRoleCell = playersSheet.getRange(details.oldLeaderPlayerSheetRow, pCols[`${details.oldLeaderPlayerCurrentTeamSlot}_ROLE`] + 1);
      oldLeaderRoleCell.setValue(ROLES.PLAYER);
    } else if (details.oldLeaderEmailOnTeamsSheet && details.oldLeaderEmailOnTeamsSheet.toLowerCase() !== newLeaderUserEmail.toLowerCase()) {
      Logger.log(`${CONTEXT_HELPER}: Player record for former leader ${details.oldLeaderEmailOnTeamsSheet} not found or not on this team for role demotion.`);
    }

    teamsSheet.getRange(details.teamSheetRow, tCols.LEADER_EMAIL + 1).setValue(newLeaderUserEmail);
    teamsSheet.getRange(details.teamSheetRow, tCols.LAST_ACTIVE + 1).setValue(getCurrentTimestamp());
    Logger.log(`${CONTEXT_HELPER}: Updated LEADER_EMAIL for team (sheet row ${details.teamSheetRow}) to ${newLeaderUserEmail} in Teams sheet.`);
    return true;
  }, "Admin/Leader Set Team Leader Sheets", [BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET, BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET]);

  if (!updateResult) { // withMultiSheetBypass typically throws an error on failure, or returns the operation's result.
                      // If operation returns false, this check is fine. If it throws, it's caught by core_adminSetTeamLeader's try-catch.
      return createErrorResponse("Failed to set team leader due to an issue with sheet protection bypass or sheet operations.");
  }
  Logger.log(`${CONTEXT_HELPER}: Sheet updates completed via bypass.`);
  return { success: true };
}

// =============================================================================
// ADMIN TEAM MANAGEMENT FUNCTIONS
// =============================================================================

function core_adminSetTeamLeader(teamId, newLeaderUserEmail, requestingUserEmail) {
  const CONTEXT = "AdministratorService.core_adminSetTeamLeader";
  try {
    Logger.log(`${CONTEXT}: START ---- Attempting to set ${newLeaderUserEmail} as leader for team ${teamId}, requested by ${requestingUserEmail}`);

    const validationResult = _as_validateSetLeaderPermissionsAndInputs(teamId, newLeaderUserEmail, requestingUserEmail);
    if (!validationResult.success) return validationResult;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamsSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.TEAMS_SHEET);
    const playersSheet = ss.getSheetByName(BLOCK_CONFIG.MASTER_SHEET.PLAYERS_SHEET);
    if (!teamsSheet || !playersSheet) return createErrorResponse("Database error: Teams or Players sheet not found.");

    const details = _as_getTeamAndLeaderDetails(teamId, newLeaderUserEmail, teamsSheet, playersSheet);
    if (!details.success) {
      Logger.log(`${CONTEXT}: Failed to get team/leader details: ${details.message}`);
      return details;
    }

    Logger.log(`${CONTEXT}: Retrieved details - Old Leader on Teams: ${details.oldLeaderEmailOnTeamsSheet}, New Leader PlayerSheetRow: ${details.newLeaderPlayerSheetRow}, Slot: ${details.newLeaderCurrentTeamSlot}, Current Role in Slot: ${details.newLeaderCurrentRoleInSlot}`);

    if (details.oldLeaderEmailOnTeamsSheet &&
        details.oldLeaderEmailOnTeamsSheet.toLowerCase() === newLeaderUserEmail.toLowerCase() &&
        details.newLeaderCurrentRoleInSlot === ROLES.TEAM_LEADER) {
      Logger.log(`${CONTEXT}: ${newLeaderUserEmail} is already leader of team ${teamId} (verified). No change needed.`);
      return createSuccessResponse({ teamId: teamId, newLeader: newLeaderUserEmail, oldLeader: details.oldLeaderEmailOnTeamsSheet || "None" }, `${newLeaderUserEmail} is already the leader with correct role. No change made.`);
    }

    const updateSheetsResult = _as_performLeaderSheetUpdates(details, newLeaderUserEmail, teamsSheet, playersSheet);
    if (!updateSheetsResult.success) return updateSheetsResult;

    // --- CACHE INVALIDATION ---
    const cache = CacheService.getScriptCache();
    // 1. Invalidate TeamDataManager cache for this teamId
    const teamCacheKeyActive = `teamData_${teamId}_incInactive_false`;
    const teamCacheKeyInactive = `teamData_${teamId}_incInactive_true`;
    cache.remove(teamCacheKeyActive);
    cache.remove(teamCacheKeyInactive);
    // Logger.log(`${CONTEXT}: Invalidated TeamDataManager cache for team ${teamId}.`);

    // 2. Invalidate PlayerDataManager cache for OLD leader (if exists and different from new)
    if (details.oldLeaderEmailOnTeamsSheet && details.oldLeaderEmailOnTeamsSheet.toLowerCase() !== newLeaderUserEmail.toLowerCase()) {
        _pdm_invalidatePlayerCache(details.oldLeaderEmailOnTeamsSheet, details.oldLeaderPlayerId); // Assumes _pdm_invalidatePlayerCache is global from PlayerDataManager
    }

    // 3. Invalidate PlayerDataManager cache for NEW leader
    _pdm_invalidatePlayerCache(newLeaderUserEmail, details.newLeaderPlayerId); // Assumes _pdm_invalidatePlayerCache is global
    // --- END CACHE INVALIDATION ---

    // Clear PermissionManager role cache
    if (details.oldLeaderEmailOnTeamsSheet && details.oldLeaderEmailOnTeamsSheet.toLowerCase() !== newLeaderUserEmail.toLowerCase()) {
        clearUserRoleCache(details.oldLeaderEmailOnTeamsSheet);
    }
    clearUserRoleCache(newLeaderUserEmail);
    if (requestingUserEmail.toLowerCase() !== (details.oldLeaderEmailOnTeamsSheet || "").toLowerCase() &&
        requestingUserEmail.toLowerCase() !== newLeaderUserEmail.toLowerCase()){
        clearUserRoleCache(requestingUserEmail);
    }

    Logger.log(`${CONTEXT}: END ---- Successfully assigned ${newLeaderUserEmail} as leader for team ${teamId}.`);
    return createSuccessResponse({ teamId: teamId, newLeader: newLeaderUserEmail, oldLeader: details.oldLeaderEmailOnTeamsSheet || "None" }, `Successfully assigned ${newLeaderUserEmail} as leader for team ${teamId}.`);

  } catch (e) {
    Logger.log(`${CONTEXT}: CRITICAL ERROR CATCH BLOCK ---- ${e.message} \nStack: ${e.stack}`);
    return handleError(e, CONTEXT);
  }
}