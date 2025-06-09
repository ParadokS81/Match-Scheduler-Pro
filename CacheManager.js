/**
 * Schedule Manager - System Cache Manager
 * @version 1.0.0 (2025-06-08)
 *
 * Purpose: Manages the SYSTEM_CACHE sheet, which stores pre-computed/denormalized
 * data for fast frontend retrieval, such as full team rosters.
 */

/**
 * Updates the cached data for a specific team. This is the "slow" operation
 * that runs once after a roster change, so that frontend reads are fast.
 * @param {string} teamId The ID of the team to update.
 * @return {boolean} True if successful, false otherwise.
 */
function _cache_updateTeamData(teamId) {
  const CONTEXT = "CacheManager._cache_updateTeamData";
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cacheSheet = ss.getSheetByName('SYSTEM_CACHE');
    if (!cacheSheet) {
      Logger.log(`${CONTEXT}: SYSTEM_CACHE sheet not found. Aborting.`);
      return false;
    }

    const teamData = getTeamData(teamId, true); // Include inactive in case we're caching an archival
    if (!teamData) {
      Logger.log(`${CONTEXT}: Could not find team data for ${teamId}. Aborting cache update.`);
      return false;
    }

    // This is the "database join" operation
    const allPlayersResult = getAllPlayers(true); // Get all players, including inactive
    if (!allPlayersResult.success) {
      Logger.log(`${CONTEXT}: Could not retrieve player data. Aborting cache update.`);
      return false;
    }

    const roster = [];
    for (const player of allPlayersResult.players) {
      let playerTeamData = null;
      if (player.team1 && player.team1.teamId === teamId) {
        playerTeamData = player.team1;
      } else if (player.team2 && player.team2.teamId === teamId) {
        playerTeamData = player.team2;
      }

      if (playerTeamData) {
        roster.push({
          displayName: player.displayName,
          initials: playerTeamData.initials,
          role: playerTeamData.role,
          googleEmail: player.googleEmail,
          // The new Discord username field!
          discordUsername: player.discordUsername || null
        });
      }
    }
    
    // Find the correct row in the cache sheet to update
    const teamIdsInData = cacheSheet.getRange('A2:A').getValues().flat();
    const rowIndex = teamIdsInData.indexOf(teamId);

    if (rowIndex !== -1) {
      const sheetRow = rowIndex + 2;
      // Update the lightweight data and the heavy RosterJSON
      cacheSheet.getRange(sheetRow, 2).setValue(teamData.teamName);
      cacheSheet.getRange(sheetRow, 3).setValue(teamData.division);
      cacheSheet.getRange(sheetRow, 4).setValue(teamData.logoUrl);
      cacheSheet.getRange(sheetRow, 5).setValue(teamData.isPublic);
      cacheSheet.getRange(sheetRow, 6).setValue(JSON.stringify(roster));
      Logger.log(`${CONTEXT}: Successfully updated cache for team ${teamId}.`);
      return true;
    } else {
      Logger.log(`${CONTEXT}: Could not find team ${teamId} in SYSTEM_CACHE sheet to update.`);
      return false;
    }
  } catch (e) {
    Logger.log(`Error in ${CONTEXT} for team ${teamId}: ${e.message}`);
    return false;
  }
}