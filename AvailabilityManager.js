/**
 * Schedule Manager - Availability Manager (Web App Edition - Phase 1D)
 * @version 1.3.1 (2025-06-02) - Corrected all inter-file function calls to be direct global calls.
 * @version 1.3.0 (2025-05-31) - Added cache invalidation for readWeekBlockData.
 * @version 1.2.1 (2025-05-30) - Phase 1D Refactor (Permissions Updated)
 */

// ROLES, PERMISSIONS, BLOCK_CONFIG are global constants.
// Functions from Configuration.js, PermissionManager.js, PlayerDataManager.js, 
// TeamDataManager.js, WeekBlockManager.js, CellProtection.js are called directly.

// =============================================================================
// CORE AVAILABILITY OPERATIONS
// =============================================================================

function availabilityManager_updatePlayerAvailability_SERVICE(userEmail, teamId, action, timeSlots) {
  const CONTEXT = "AvailabilityManager.availabilityManager_updatePlayerAvailability_SERVICE";
  try {
    // Assuming authorizeAvailabilityUpdate is global from PermissionManager.js
    const authResult = authorizeAvailabilityUpdate(userEmail, teamId);
    if (!authResult.hasPermission) {
      return createErrorResponse(authResult.reason, { permissionDenied: true }); // Assumes global
    }

    // Assumes getUserTeams is global from PlayerDataManager.js
    const userTeams = getUserTeams(userEmail); 
    const teamMembership = userTeams.find(team => team.teamId === teamId);

    if (!teamMembership) {
      return createErrorResponse("You are not currently listed as a member of this team."); // Assumes global
    }

    const userInitials = teamMembership.initials;
    // Assumes isValidInitials is global from Configuration.js or PlayerDataManager.js
    if (!userInitials || !isValidInitials(userInitials)) { 
      return createErrorResponse("Invalid or missing initials for this team. Please set them in your player profile for this team.");
    }

    if (!timeSlots || !Array.isArray(timeSlots) || timeSlots.length === 0) {
      return createErrorResponse("No time slots specified for update.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Assumes getTeamData is global from TeamDataManager.js
    const teamData = getTeamData(teamId); 
    if (!teamData || !teamData.availabilitySheetName) {
        return createErrorResponse("Team data or availability sheet name not found.");
    }
    const teamSheet = ss.getSheetByName(teamData.availabilitySheetName);

    if (!teamSheet) {
      return createErrorResponse(`Team schedule sheet "${teamData.availabilitySheetName}" not found.`);
    }

    // Assumes withProtectionBypass is global from CellProtection.js
    const updateResultData = withProtectionBypass(() => { 
      let cellsModifiedCount = 0;
      let invalidCellsCount = 0;
      const modifiedCellReferences = [];

      for (const slot of timeSlots) {
        // Assumes updateAvailabilityCell is a local helper or global within this file
        const cellUpdateResult = updateAvailabilityCell( 
          teamSheet,
          slot.row,
          slot.col,
          userInitials,
          action
        );

        if (cellUpdateResult.modified) {
          cellsModifiedCount++;
          modifiedCellReferences.push({row: slot.row, col: slot.col});
        } else if (cellUpdateResult.invalid) {
          invalidCellsCount++;
        }
      }
      return {
        success: true,
        cellsModified: cellsModifiedCount,
        invalidCells: invalidCellsCount,
        modifiedCellRefs: modifiedCellReferences
      };
    }, "Update Player Availability", teamData.availabilitySheetName);

    if (!updateResultData || updateResultData.success === false) {
      return createErrorResponse("Failed to update availability - protection bypass or operation error.");
    }

    if (updateResultData.cellsModified > 0) {
      if (BLOCK_CONFIG.SETTINGS.APPLY_SHEET_COLOR_CODING === true) { 
        // Assumes applyAvailabilityColors is a local helper or global within this file
        applyAvailabilityColors(teamSheet, updateResultData.modifiedCellRefs); 
      }
      // Assumes updateTeam is global from TeamDataManager.js, getCurrentTimestamp from Configuration.js
      updateTeam(teamId, { lastActive: getCurrentTimestamp() }, BLOCK_CONFIG.ADMIN.SYSTEM_EMAIL); 

      // Assumes findAllWeekBlocks is global from WeekBlockManager.js
      const allBlocksOnSheet = findAllWeekBlocks(teamSheet);
      const invalidatedBlockKeys = new Set();

      for (const cellRef of updateResultData.modifiedCellRefs) {
        for (const block of allBlocksOnSheet) {
          if (cellRef.row >= block.startRow && cellRef.row <= block.endRow) {
            _am_invalidateScheduleCacheForBlock(teamSheet.getName(), block.year, block.weekNumber);
            invalidatedBlockKeys.add(`${teamSheet.getName()}_${block.year}_W${block.weekNumber}`); 
            break; 
          }
        }
      }
      if (invalidatedBlockKeys.size > 0) {
        Logger.log(`${CONTEXT}: Invalidated schedule cache for blocks: ${Array.from(invalidatedBlockKeys).join(', ')}`);
      }
    }
    // Assumes createSuccessResponse and generateUpdateMessage are global/local
    return createSuccessResponse({
      cellsModified: updateResultData.cellsModified,
      invalidCells: updateResultData.invalidCells,
      userInitials: userInitials,
      action: action
    }, generateUpdateMessage(action, updateResultData.cellsModified, updateResultData.invalidCells, userInitials)); 

  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

function availabilityManager_updatePlayerAvailabilityForMultipleWeeks_SERVICE(userEmail, teamId, action, weeklyPayloads) {
    const CONTEXT = "AvailabilityManager.updatePlayerAvailabilityForMultipleWeeks_SERVICE_BATCHED"; // Note new context name
        try {
        // 1. Initial Authorizations and User/Team Data Setup (remains the same)
        const authResult = authorizeAvailabilityUpdate(userEmail, teamId); //
        if (!authResult.hasPermission) {
            return createErrorResponse(authResult.reason, { permissionDenied: true }); //
        }
        const userTeams = getUserTeams(userEmail); //
        const teamMembership = userTeams.find(team => team.teamId === teamId);
        if (!teamMembership) {
            return createErrorResponse("You are not currently listed as a member of this team."); //
        }
        const userInitials = teamMembership.initials;
        if (!userInitials || !isValidInitials(userInitials)) { //
             return createErrorResponse("Invalid or missing initials for this team. Please set them in your player profile for this team."); //
        }
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const teamDataObject = getTeamData(teamId); //
        if (!teamDataObject || !teamDataObject.availabilitySheetName) {
            return createErrorResponse("Team data or availability sheet name not found."); //
        }
        const teamSheet = ss.getSheetByName(teamDataObject.availabilitySheetName);
        if (!teamSheet) {
            return createErrorResponse(`Team schedule sheet "${teamDataObject.availabilitySheetName}" not found.`); //
        }

        let overallCellsModifiedCount = 0;
        let overallInvalidCellsCount = 0;
        const overallModifiedSheetCellReferences = [];

        // Wrap the entire multi-week processing in a single withProtectionBypass
        const batchUpdateResult = withProtectionBypass(() => { //
            let anyModificationInAnyWeek = false;

            for (const weeklyData of weeklyPayloads) {
                const { year, weekNumber, selections } = weeklyData;
                if (!selections || selections.length === 0) continue;

                const weekBlock = findWeekBlock(teamSheet, year, weekNumber); //
                if (!weekBlock) {
                    Logger.log(`${CONTEXT}: Week block ${year}-W${weekNumber} not found. Skipping ${selections.length} selections.`);
                    overallInvalidCellsCount += selections.length;
                    continue;
                }

                const blockStartSheetRow = weekBlock.startRow; //
                const daysStartSheetCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1; //
                const numTimeSlotsInBlock = BLOCK_CONFIG.TIME.STANDARD_TIME_SLOTS.length; //
                const numDaysInBlock = 7;

                let minVisualRow = selections[0].visualRow;
                let maxVisualRow = selections[0].visualRow;
                let minVisualCol = selections[0].visualCol;
                let maxVisualCol = selections[0].visualCol;
                for (let i = 1; i < selections.length; i++) {
                    minVisualRow = Math.min(minVisualRow, selections[i].visualRow);
                    maxVisualRow = Math.max(maxVisualRow, selections[i].visualRow);
                    minVisualCol = Math.min(minVisualCol, selections[i].visualCol);
                    maxVisualCol = Math.max(maxVisualCol, selections[i].visualCol);
                }
                minVisualRow = Math.max(0, minVisualRow);
                maxVisualRow = Math.min(numTimeSlotsInBlock - 1, maxVisualRow);
                minVisualCol = Math.max(0, minVisualCol);
                maxVisualCol = Math.min(numDaysInBlock - 1, maxVisualCol);

                const rangeToReadStartRow = blockStartSheetRow + minVisualRow;
                const rangeToReadStartCol = daysStartSheetCol + minVisualCol;
                const numRowsToRead = (maxVisualRow - minVisualRow) + 1;
                const numColsToRead = (maxVisualCol - minVisualCol) + 1;

                let cellsModifiedThisWeek = 0;
                let invalidCellsThisWeek = 0;

                const dataRange = teamSheet.getRange(rangeToReadStartRow, rangeToReadStartCol, numRowsToRead, numColsToRead);
                const currentValues = dataRange.getDisplayValues();
                const newValues = JSON.parse(JSON.stringify(currentValues)); // Deep copy

                for (const sel of selections) {
                    if (sel.visualRow >= minVisualRow && sel.visualRow <= maxVisualRow &&
                        sel.visualCol >= minVisualCol && sel.visualCol <= maxVisualCol) {
                        const arrayRow = sel.visualRow - minVisualRow;
                        const arrayCol = sel.visualCol - minVisualCol;
                        const currentText = String(newValues[arrayRow][arrayCol] || "").trim();
                        const currentInitialsArray = currentText ? currentText.toUpperCase().split(/[,\s]+/).filter(e => e.trim()) : [];
                        let tempNewInitialsArray = [...currentInitialsArray];
                        let modifiedThisCell = false;
                        const ucUserInitials = userInitials.toUpperCase();

                        if (action === "add") {
                            if (!tempNewInitialsArray.includes(ucUserInitials)) {
                                tempNewInitialsArray.push(ucUserInitials); tempNewInitialsArray.sort(); modifiedThisCell = true;
                            }
                        } else if (action === "remove") {
                            const initialIndex = tempNewInitialsArray.indexOf(ucUserInitials);
                            if (initialIndex > -1) {
                                tempNewInitialsArray.splice(initialIndex, 1); modifiedThisCell = true;
                            }
                        }
                        if (modifiedThisCell) {
                            newValues[arrayRow][arrayCol] = tempNewInitialsArray.join(", ");
                            cellsModifiedThisWeek++;
                            overallModifiedSheetCellReferences.push({
                                row: blockStartSheetRow + sel.visualRow, col: daysStartSheetCol + sel.visualCol
                            });
                        }
                    } else {
                        if (sel.visualRow < 0 || sel.visualRow >= numTimeSlotsInBlock || sel.visualCol < 0 || sel.visualCol >= numDaysInBlock) {
                            Logger.log(`${CONTEXT}: Sel (${sel.visualRow},${sel.visualCol}) for ${year}-W${weekNumber} out of block bounds.`);
                            invalidCellsThisWeek++;
                        }
                    }
                }
                if (cellsModifiedThisWeek > 0) {
                    dataRange.setValues(newValues); // Write for this week
                    anyModificationInAnyWeek = true;
                }
                overallCellsModifiedCount += cellsModifiedThisWeek;
                overallInvalidCellsCount += invalidCellsThisWeek;
                if (cellsModifiedThisWeek > 0) {
                    _am_invalidateScheduleCacheForBlock(teamSheet.getName(), year, weekNumber); //
                }
            } // End loop weeklyPayloads
            return anyModificationInAnyWeek; // Return if any sheet writes actually happened
        }, "Batch Update Multiple Weeks Availability", teamDataObject.availabilitySheetName);


        if (!batchUpdateResult && overallCellsModifiedCount > 0) {
            // This means withProtectionBypass failed, or the inner logic returned false when it shouldn't have.
            // If overallCellsModifiedCount > 0, it means we *intended* to write but batchUpdateResult is false.
            Logger.log(`${CONTEXT}: Overall batch update failed or reported no changes despite modifications tallied. Review protection bypass logs.`);
            // Don't return error yet, let it try to build a response if some cells were tallied as modified.
            // This path might be tricky to hit if withProtectionBypass throws on failure.
        }

        if (overallCellsModifiedCount > 0) {
            if (BLOCK_CONFIG.SETTINGS.APPLY_SHEET_COLOR_CODING === true) { //
                applyAvailabilityColors(teamSheet, overallModifiedSheetCellReferences); //
            }
            updateTeam(teamId, { lastActive: getCurrentTimestamp() }, BLOCK_CONFIG.ADMIN.SYSTEM_EMAIL); //
        }

        return createSuccessResponse({ //
            cellsModified: overallCellsModifiedCount,
            invalidCells: overallInvalidCellsCount,
            userInitials: userInitials,
            action: action
        }, generateUpdateMessage(action, overallCellsModifiedCount, overallInvalidCellsCount, userInitials)); //

    } catch (e) {
        return handleError(e, CONTEXT); //
    }
}

function updateAvailabilityCell(sheet, row, col, initials, action) {
  try {
    // Assumes isValidAvailabilityCell is local/global
    if (!isValidAvailabilityCell(sheet, row, col)) { 
      return { modified: false, invalid: true };
    }
    // ... rest of function (seems mostly self-contained or uses Apps Script globals)
    const cell = sheet.getRange(row, col);
    const currentValue = cell.getValue();
    const currentText = String(currentValue || "").trim();
    const currentInitialsArray = currentText ? 
      currentText.toUpperCase().split(/[,\s]+/).filter(e => e.trim()) : 
      [];
    
    let newInitialsArray = [...currentInitialsArray];
    let modified = false;
    const ucInitials = initials.toUpperCase();

    if (action === "add") {
      if (!newInitialsArray.includes(ucInitials)) {
        newInitialsArray.push(ucInitials);
        newInitialsArray.sort(); 
        modified = true;
      }
    } else if (action === "remove") {
      const initialIndex = newInitialsArray.indexOf(ucInitials);
      if (initialIndex > -1) {
        newInitialsArray.splice(initialIndex, 1);
        modified = true;
      }
    }
    
    if (modified) {
      const newValue = newInitialsArray.join(", ");
      cell.setValue(newValue);
      return { modified: true, invalid: false, oldValue: currentText, newValue: newValue};
    }
    
    return { modified: false, invalid: false, oldValue: currentText, newValue: currentText };
  } catch (e) {
    Logger.log(`Error updating cell ${row},${col}: ${e.message}`);
    return { modified: false, invalid: true, error: e.message };
  }
}

function removePlayerInitialsFromSchedule(availabilitySheetName, playerInitialsToRemove, clearCurrentAndFuture) {
  const CONTEXT = "AvailabilityManager.removePlayerInitialsFromSchedule";
  try {
    if (!availabilitySheetName || !playerInitialsToRemove) {
      return createErrorResponse("Sheet name and player initials are required."); 
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(availabilitySheetName);
    if (!sheet) {
      return createErrorResponse(`Availability sheet "${availabilitySheetName}" not found.`); 
    }

    const ucInitialsToRemove = playerInitialsToRemove.toUpperCase();
    // Assumes findAllWeekBlocks is global from WeekBlockManager.js
    const allBlocks = findAllWeekBlocks(sheet);
    if (!allBlocks || allBlocks.length === 0) {
      return createSuccessResponse({}, "No week blocks found on the sheet. Nothing to clear.");
    }

    let currentYear, currentWeekNum;
    if (clearCurrentAndFuture) {
      // Assumes getCurrentCETDate, getISOWeekNumber are global from Configuration.js
      const now = getCurrentCETDate(); 
      currentYear = now.getFullYear();
      currentWeekNum = getISOWeekNumber(now); 
    }

    let totalCellsCleared = 0;
    const modifiedCellReferences = []; 

    // Assumes withProtectionBypass is global from CellProtection.js
    const clearResult = withProtectionBypass(() => {
      for (const block of allBlocks) {
        if (clearCurrentAndFuture) {
          const blockIsCurrentOrFuture = (block.year > currentYear) ||
                                       (block.year === currentYear && block.weekNumber >= currentWeekNum);
          if (!blockIsCurrentOrFuture) {
            continue;
          }
        }
        // BLOCK_CONFIG is global
        const startDataRow = block.startRow;
        const numTimeSlots = BLOCK_CONFIG.TIME.STANDARD_TIME_SLOTS.length; 
        const startDataCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1; 

        for (let rOffset = 0; rOffset < numTimeSlots; rOffset++) {
          const currentRowInSheet = startDataRow + rOffset;
          for (let cOffset = 0; cOffset < 7; cOffset++) {
            const currentColInSheet = startDataCol + cOffset;
            const cell = sheet.getRange(currentRowInSheet, currentColInSheet);
            const currentValue = cell.getValue();
            const currentText = String(currentValue || "").trim();

            if (currentText) {
              const initialsArray = currentText.toUpperCase().split(/[,\s]+/).filter(e => e.trim());
              const initialIndex = initialsArray.indexOf(ucInitialsToRemove);

              if (initialIndex > -1) {
                initialsArray.splice(initialIndex, 1);
                const newValue = initialsArray.join(", ");
                cell.setValue(newValue);
                totalCellsCleared++;
                modifiedCellReferences.push({row: currentRowInSheet, col: currentColInSheet});
              }
            }
          }
        }
      }
      return true;
    }, "Remove Player Initials Batch", availabilitySheetName);

    if (!clearResult) {
        return createErrorResponse("Failed to clear initials due to protection bypass or sheet operation error."); 
    }

    if (totalCellsCleared > 0) {
      // Assumes applyAvailabilityColors is local/global
      applyAvailabilityColors(sheet, modifiedCellReferences);
      
      const allBlocksOnSheetForCache = findAllWeekBlocks(sheet); // Re-fetch for cache invalidation
      const invalidatedBlockKeys = new Set();

      for (const cellRef of modifiedCellReferences) {
        for (const block of allBlocksOnSheetForCache) { 
          if (cellRef.row >= block.startRow && cellRef.row <= block.endRow) {
             _am_invalidateScheduleCacheForBlock(sheet.getName(), block.year, block.weekNumber);
            invalidatedBlockKeys.add(`${sheet.getName()}_${block.year}_W${block.weekNumber}`);
            break; 
          }
        }
      }
      if (invalidatedBlockKeys.size > 0) {
        Logger.log(`${CONTEXT}: Invalidated schedule cache for blocks: ${Array.from(invalidatedBlockKeys).join(', ')}`);
      }
    }
    // Assumes createSuccessResponse is global
    return createSuccessResponse({ cellsCleared: totalCellsCleared },
      `Cleared initials "${ucInitialsToRemove}" from ${totalCellsCleared} time slots.`);

  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

// Renamed function
function am_getTeamSchedule(userEmail, teamId, year = null, weekNumber = null) {
  const CONTEXT = "AvailabilityManager.am_getTeamSchedule"; // Keep context clear
  Logger.log(`[${CONTEXT}] ENTERED. User: ${userEmail}, Team: ${teamId}, Year: ${year}, Week: ${weekNumber}`);
  try {
    const now = getCurrentCETDate(); // Assumes global
    if (!year) year = now.getFullYear();
    if (!weekNumber) weekNumber = getISOWeekNumber(now); // Assumes global
    
    // Corrected: Direct calls
    const userTeams = getUserTeams(userEmail);      // Was PlayerDataManager.getUserTeams
    const overallUserRole = getUserRole(userEmail); // Was PermissionManager.getUserRole
    const isAdmin = overallUserRole === ROLES.ADMIN; // ROLES is global
    
    const teamMembership = userTeams.find(team => team.teamId === teamId);
    const isMemberOfThisTeam = !!teamMembership;

    if (!isMemberOfThisTeam && !isAdmin) {
      return createErrorResponse("Permission denied: You must be a member of this team or an Administrator to view its schedule."); // Assumes global
    }
    
    const teamData = getTeamData(teamId); // Was TeamDataManager.getTeamData
    if (!teamData) { 
      return createErrorResponse(`Team not found: ${teamId}`);
    }
    
    if (!teamData.availabilitySheetName) {
        return createErrorResponse("Team availability sheet name is not configured.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamSheet = ss.getSheetByName(teamData.availabilitySheetName);
    
    if (!teamSheet) {
      return createErrorResponse(`Team schedule sheet "${teamData.availabilitySheetName}" not found.`);
    }
    
    // This calls readTeamScheduleData within this AvailabilityManager.js file
    const scheduleData = readTeamScheduleData(teamSheet, year, weekNumber); 
    
    // Corrected: Direct calls
    const teamPlayersResult = getAllPlayers(false, { teamId: teamId }); // Was PlayerDataManager.getAllPlayers
    const teamPlayers = teamPlayersResult.success ? teamPlayersResult.players.map(p => ({
        displayName: getUserDisplayName(p.googleEmail), // Was PlayerDataManager.getUserDisplayName
        initials: p.team1.teamId === teamId ? p.team1.initials : (p.team2.teamId === teamId ? p.team2.initials : '??')
    })) : [];
    
    // This is the full data return
    return createSuccessResponse({ // Assumes global
      teamId: teamId,
      teamName: teamData.teamName,
      division: teamData.division,
      year: year,
      weekNumber: weekNumber,
      players: teamPlayers,
      schedule: scheduleData, 
      userMembership: teamMembership, 
      canEdit: isMemberOfThisTeam || isAdmin 
    });
    
  } catch (e) {
    Logger.log(`[${CONTEXT}] Error for ${userEmail}, team ${teamId}, ${year}W${weekNumber}: ${e.message} \nStack: ${e.stack}`);
    return handleError(e, CONTEXT); // Assumes global
  }
}

// This function calls WeekBlockManager functions, which need to be global
function readTeamScheduleData(teamSheet, year, weekNumber) {
  const CONTEXT = "AvailabilityManager.readTeamScheduleData (v1.1 - direct calls)";
  Logger.log(`[${CONTEXT}] ENTERED. Sheet: ${teamSheet.getName()}, Year: ${year}, Week: ${weekNumber}`);
  try {
    Logger.log(`[${CONTEXT}] Calling findWeekBlock...`);
    let weekBlock = findWeekBlock(teamSheet, year, weekNumber); // DIRECT CALL to WeekBlockManager's function
    
    if (!weekBlock) {
      Logger.log(`[${CONTEXT}] Week block NOT found. Calling ensureWeekExists...`);
      const ensuredBlock = ensureWeekExists(teamSheet, year, weekNumber); // DIRECT CALL to WeekBlockManager's function
      
      if (!ensuredBlock || !ensuredBlock.success || !ensuredBlock.startRow) { 
        Logger.log(`[${CONTEXT}] Failed to find or create week block. EnsuredBlock: ${JSON.stringify(ensuredBlock)}`);
        throw new Error(`Failed to find or create week block: ${year} W${weekNumber} on sheet ${teamSheet.getName()}. Message: ${ensuredBlock.message}`);
      }
      weekBlock = ensuredBlock; 
      Logger.log(`[${CONTEXT}] Block ensured/created: ${JSON.stringify(weekBlock)}`);
    }
    
    Logger.log(`[${CONTEXT}] Calling readWeekBlockData (from WeekBlockManager) with weekBlock: ${JSON.stringify(weekBlock)}`);
    // This call targets the global readWeekBlockData function in WeekBlockManager.js
    return readWeekBlockData(teamSheet, weekBlock); // DIRECT CALL to WeekBlockManager's function
    
  } catch (e) {
    Logger.log(`Error in ${CONTEXT} for sheet ${teamSheet.getName()}, ${year}W${weekNumber}: ${e.message}`);
    return { 
        year: year, weekNumber: weekNumber, month: "Error", 
        timeSlots: BLOCK_CONFIG.TIME.STANDARD_TIME_SLOTS, 
        dayHeaders: BLOCK_CONFIG.LAYOUT.DAY_ABBREV,     
        availability: [], 
        error: `Failed to read team schedule data in ${CONTEXT}: ${e.message}`
    }; 
  }
}


function getMultipleTeamSchedules(userEmail, teamIds, year = null, weekNumber = null) {
  const CONTEXT = "AvailabilityManager.getMultipleTeamSchedules";
  try {
    const schedules = [];
    const errors = [];
    
    const now = getCurrentCETDate(); // Assumes global
    if (!year) year = now.getFullYear();
    if (!weekNumber) weekNumber = getISOWeekNumber(now); // Assumes global
    
    for (const teamId of teamIds) {
      // This calls am_getTeamSchedule from this file
      const result = am_getTeamSchedule(userEmail, teamId, year, weekNumber); 
      if (result.success) {
        schedules.push(result.data || result); 
      } else {
        errors.push({ teamId: teamId, error: result.message });
      }
    }
    // Assumes createSuccessResponse is global
    return createSuccessResponse({
      year: year,
      weekNumber: weekNumber,
      schedules: schedules,
      errors: errors,
      totalTeams: teamIds.length,
      successfulTeams: schedules.length
    });
    
  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

function getTeamScheduleRange(userEmail, teamId, startYear, startWeek, endYear = null, endWeek = null) {
  const CONTEXT = "AvailabilityManager.getTeamScheduleRange";
  try {
    // Corrected: Direct calls
    const userTeams = getUserTeams(userEmail);          // Was PlayerDataManager.getUserTeams
    const overallUserRole = getUserRole(userEmail);     // Was PermissionManager.getUserRole
    const isAdmin = overallUserRole === ROLES.ADMIN;    // ROLES is global
    const teamMembership = userTeams.find(team => team.teamId === teamId);
    const isMemberOfThisTeam = !!teamMembership;

    if (!isMemberOfThisTeam && !isAdmin) {
      return createErrorResponse("Permission denied: You must be a member or an Administrator."); // Assumes global
    }
    
    if (!endYear) endYear = startYear;
    if (!endWeek) { 
        // Assumes getMondayFromWeekNumberAndYear, getISOWeekNumber are global
        const tempMonday = getMondayFromWeekNumberAndYear(startYear, startWeek);
        const nextMonday = new Date(tempMonday); 
        nextMonday.setDate(tempMonday.getDate() + 7);
        endWeek = getISOWeekNumber(nextMonday);
        endYear = nextMonday.getFullYear();
    }
    
    const teamData = getTeamData(teamId); // Was TeamDataManager.getTeamData
    if (!teamData) return createErrorResponse(`Team not found: ${teamId}`);

    if (!teamData.availabilitySheetName) {
        return createErrorResponse("Team availability sheet name is not configured.");
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamSheet = ss.getSheetByName(teamData.availabilitySheetName);
    if (!teamSheet) return createErrorResponse(`Team schedule sheet "${teamData.availabilitySheetName}" not found.`);
    
    const weeksInRange = [];
    let currentProcYear = startYear;
    let currentProcWeek = startWeek;
    let iterations = 0;
    const MAX_ITERATIONS = 104; // BLOCK_CONFIG.TEAM_SETTINGS.MAX_WEEKS_TO_FETCH_RANGE or similar could be good

    while (iterations < MAX_ITERATIONS && 
           (currentProcYear < endYear || (currentProcYear === endYear && currentProcWeek <= endWeek))) {
      // This calls readTeamScheduleData from this file
      const weekData = readTeamScheduleData(teamSheet, currentProcYear, currentProcWeek); 
      weeksInRange.push(weekData);
      
      const currentBlockMonday = getMondayFromWeekNumberAndYear(currentProcYear, currentProcWeek);
      const nextWeekMonday = new Date(currentBlockMonday); 
      nextWeekMonday.setDate(currentBlockMonday.getDate() + 7);
      currentProcYear = nextWeekMonday.getFullYear();
      currentProcWeek = getISOWeekNumber(nextWeekMonday);
      iterations++;
    }
     if (iterations >= MAX_ITERATIONS) {
        Logger.log(`${CONTEXT}: Max iterations reached for schedule range. Truncating results.`);
    }
    
    // Corrected: Direct calls
    const teamPlayersResult = getAllPlayers(false, { teamId: teamId }); // Was PlayerDataManager.getAllPlayers
    const teamPlayers = teamPlayersResult.success ? teamPlayersResult.players.map(p => ({
        displayName: getUserDisplayName(p.googleEmail), // Was PlayerDataManager.getUserDisplayName
        initials: p.team1.teamId === teamId ? p.team1.initials : (p.team2.teamId === teamId ? p.team2.initials : '??')
    })) : [];
    
    // Assumes createSuccessResponse is global
    return createSuccessResponse({
      teamId: teamId,
      teamName: teamData.teamName,
      division: teamData.division,
      players: teamPlayers,
      weeks: weeksInRange,
      weekCount: weeksInRange.length,
      userMembership: teamMembership,
      canEdit: isMemberOfThisTeam || isAdmin
    });
    
  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

// =============================================================================
// VALIDATION & UTILITIES
// =============================================================================

function isValidAvailabilityCell(sheet, row, col) {
  try {
    // Assumes findAllWeekBlocks is global from WeekBlockManager.js
    const allBlocks = findAllWeekBlocks(sheet);
    if (!allBlocks || allBlocks.length === 0) return false; 

    for (const block of allBlocks) {
      const blockStartDataRow = block.startRow;
      const blockEndDataRow = block.endRow;
      // BLOCK_CONFIG is global
      const daysStartDataCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1;
      const daysEndDataCol = daysStartDataCol + BLOCK_CONFIG.LAYOUT.DAYS_PER_WEEK - 1;
      if (row >= blockStartDataRow && row <= blockEndDataRow &&
          col >= daysStartDataCol && col <= daysEndDataCol) {
        return true;
      }
    }
    return false;
  } catch (e) {
    Logger.log(`Error validating cell ${sheet.getName()}!${row},${col}: ${e.message}`);
    return false;
  }
}

function applyAvailabilityColors(sheet, updatedCells) {
  const CONTEXT = "AvailabilityManager.applyAvailabilityColors";
  try {
    if (!updatedCells || updatedCells.length === 0) return;
    // Assumes withProtectionBypass is global from CellProtection.js
    withProtectionBypass(() => {
      for (const cellRef of updatedCells) {
        const cell = sheet.getRange(cellRef.row, cellRef.col);
        const cellValue = cell.getValue();
        const initials = String(cellValue || "").split(/[,\s]+/).filter(e => e.trim());
        const playerCount = initials.length;
        let backgroundColor;
        // BLOCK_CONFIG is global
        const isWeekend = (cellRef.col >= (BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1 + 5)); 
        if (playerCount === 0) {
          backgroundColor = isWeekend ? BLOCK_CONFIG.COLORS.SHEET.WEEKEND : BLOCK_CONFIG.COLORS.SHEET.WEEKDAY;
        } else if (playerCount === 1) {
          backgroundColor = BLOCK_CONFIG.COLORS.SHEET.ONE_PLAYER;
        } else if (playerCount <= 3) { 
          backgroundColor = BLOCK_CONFIG.COLORS.SHEET.TWO_TO_THREE_PLAYERS;
        } else { 
          backgroundColor = BLOCK_CONFIG.COLORS.SHEET.FOUR_PLUS_PLAYERS;
        }
        cell.setBackground(backgroundColor);
      }
    }, "Apply Availability Colors", sheet.getName());
  } catch (e) {
    Logger.log(`Error in ${CONTEXT} on sheet ${sheet.getName()}: ${e.message}`);
  }
}

function generateUpdateMessage(action, modifiedCount, invalidCount, initials) {
  // This function seems self-contained or uses only its arguments.
  let message = "";
  if (modifiedCount > 0) {
    const actionText = action === "add" ? "Added" : "Removed";
    const toFromText = action === "add" ? "to" : "from";
    message = `✅ ${actionText} your availability (${initials}) ${toFromText} ${modifiedCount} time slot${modifiedCount > 1 ? 's' : ''}.`;
    if (invalidCount > 0) {
      message += ` ${invalidCount} slot${invalidCount > 1 ? 's were' : ' was'} skipped (invalid location).`;
    }
  } else if (invalidCount > 0) {
    message = `⚠️ No changes made. All ${invalidCount} selected slot${invalidCount > 1 ? 's are' : ' is'} not in a valid availability grid.`;
  } else { 
    const actionPresentText = action === "add" ? "already present" : "not found";
    message = `ℹ️ No changes made. Your initials (${initials}) were ${actionPresentText} in the selected time slots.`;
  }
  return message;
}

// =============================================================================
// INTEGRATION FUNCTIONS
// =============================================================================
function syncTeamAvailabilityData(teamId) {
  const CONTEXT = "AvailabilityManager.syncTeamAvailabilityData";
  try {
    // Assumes getTeamData is global from TeamDataManager.js
    const teamData = getTeamData(teamId, true); 
    if (!teamData) return createErrorResponse(`Team ${teamId} not found for sync.`);

    if (!teamData.availabilitySheetName) {
        return createErrorResponse(`Availability sheet name not configured for team ${teamId}.`);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamSheet = ss.getSheetByName(teamData.availabilitySheetName);
    if (!teamSheet) {
      return createErrorResponse(`Availability sheet "${teamData.availabilitySheetName}" not found for team ${teamId}.`);
    }
    
    // Assumes getAllPlayers is global from PlayerDataManager.js
    const teamPlayersResult = getAllPlayers(false, { teamId: teamId }); 
    if (!teamPlayersResult.success) {
        return createErrorResponse(`Could not get players for team ${teamId}: ${teamPlayersResult.message}`);
    }
    const validInitialsForTeam = teamPlayersResult.players.map(p => {
        if (p.team1.teamId === teamId) return p.team1.initials;
        if (p.team2.teamId === teamId) return p.team2.initials;
        return null;
    }).filter(Boolean).map(i => i.toUpperCase());

    let cellsCleaned = 0;
    const modifiedCellReferences = []; 

    // Assumes withProtectionBypass is global
    const syncOpResult = withProtectionBypass(() => {
      // Assumes findAllWeekBlocks is global from WeekBlockManager.js
      const allBlocks = findAllWeekBlocks(teamSheet);
      for (const block of allBlocks) {
        // BLOCK_CONFIG is global
        const startDataRow = block.startRow;
        const numTimeSlots = BLOCK_CONFIG.TIME.STANDARD_TIME_SLOTS.length;
        const startDataCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1;
        
        const availabilityRange = teamSheet.getRange(startDataRow, startDataCol, numTimeSlots, 7);
        const values = availabilityRange.getDisplayValues(); 

        for (let r_sync = 0; r_sync < values.length; r_sync++) { // renamed r
          for (let c_sync = 0; c_sync < values[r_sync].length; c_sync++) { // renamed c
            const cellValue = String(values[r_sync][c_sync] || "").trim();
            if (cellValue) {
              const currentCellInitials = cellValue.toUpperCase().split(/[,\s]+/).filter(e => e.trim());
              const cleanedCellInitials = currentCellInitials.filter(initial => 
                validInitialsForTeam.includes(initial)
              );
              
              if (cleanedCellInitials.length !== currentCellInitials.length) {
                const sheetRow = startDataRow + r_sync;
                const sheetCol = startDataCol + c_sync;
                teamSheet.getRange(sheetRow, sheetCol).setValue(cleanedCellInitials.join(", "));
                cellsCleaned++;
                modifiedCellReferences.push({row: sheetRow, col: sheetCol});
              }
            }
          }
        }
      }
      return true;
    }, "Sync Availability Sheet Data", teamData.availabilitySheetName);

    if (!syncOpResult) {
        return createErrorResponse("Failed to sync availability data due to protection bypass or sheet operation error.");
    }
    
    if (cellsCleaned > 0) {
      applyAvailabilityColors(teamSheet, modifiedCellReferences); // Assumes local/global
      const allBlocksOnSheetForCache = findAllWeekBlocks(teamSheet); // Assumes global
      const invalidatedBlockKeys = new Set();
      for (const cellRef of modifiedCellReferences) {
        for (const block of allBlocksOnSheetForCache) {
          if (cellRef.row >= block.startRow && cellRef.row <= block.endRow) {
            _am_invalidateScheduleCacheForBlock(teamSheet.getName(), block.year, block.weekNumber); // Local helper
            invalidatedBlockKeys.add(`${teamSheet.getName()}_${block.year}_W${block.weekNumber}`);
            break;
          }
        }
      }
      if (invalidatedBlockKeys.size > 0) {
        Logger.log(`${CONTEXT}: Invalidated schedule cache for blocks during sync: ${Array.from(invalidatedBlockKeys).join(', ')}`);
      }
    }
    // Assumes createSuccessResponse is global
    return createSuccessResponse({ cellsCleaned: cellsCleaned }, 
      `Availability data synced for team ${teamId}: ${cellsCleaned} cells had outdated initials removed.`);
    
  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

function initializeTeamAvailabilityGrid(teamId) {
  const CONTEXT = "AvailabilityManager.initializeTeamAvailabilityGrid";
  try {
    // Assumes getTeamData is global from TeamDataManager.js
    const teamData = getTeamData(teamId, true);
    if (!teamData) return createErrorResponse(`Team ${teamId} not found for grid initialization.`);

    if (!teamData.availabilitySheetName) {
        return createErrorResponse(`Availability sheet name not configured for team ${teamId}.`);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const teamSheet = ss.getSheetByName(teamData.availabilitySheetName);
    if (!teamSheet) {
      return createErrorResponse(`Availability sheet "${teamData.availabilitySheetName}" not found for team ${teamId}.`);
    }
    
    // Assumes withProtectionBypass is global
    withProtectionBypass(() => {
      // Assumes findAllWeekBlocks is global from WeekBlockManager.js
      const allBlocks = findAllWeekBlocks(teamSheet);
      const invalidatedBlockKeys = new Set(); 

      for (const block of allBlocks) {
        // BLOCK_CONFIG is global
        const startDataRow = block.startRow;
        const numTimeSlots = BLOCK_CONFIG.TIME.STANDARD_TIME_SLOTS.length;
        const startDataCol = BLOCK_CONFIG.LAYOUT.DAYS_START_COLUMN + 1;
        
        const backgrounds = [];
        for (let r_init = 0; r_init < numTimeSlots; r_init++) { // Renamed r
          const rowBackgrounds = [];
          for (let c_init = 0; c_init < 7; c_init++) { // Renamed c
            const isWeekend = c_init >= 5; 
            rowBackgrounds.push(isWeekend ? 
              BLOCK_CONFIG.COLORS.SHEET.WEEKEND : 
              BLOCK_CONFIG.COLORS.SHEET.WEEKDAY);
          }
          backgrounds.push(rowBackgrounds);
        }
        teamSheet.getRange(startDataRow, startDataCol, numTimeSlots, 7).setBackgrounds(backgrounds);
        _am_invalidateScheduleCacheForBlock(teamSheet.getName(), block.year, block.weekNumber); // Local helper
        invalidatedBlockKeys.add(`${teamSheet.getName()}_${block.year}_W${block.weekNumber}`);
      }
       if (invalidatedBlockKeys.size > 0) {
        Logger.log(`${CONTEXT}: Invalidated schedule cache for blocks during grid initialization: ${Array.from(invalidatedBlockKeys).join(', ')}`);
      }
    }, "Initialize Availability Grid Colors", teamData.availabilitySheetName);
    
    return createSuccessResponse({}, "Availability grid initialized with default colors."); // Assumes global
    
  } catch (e) {
    return handleError(e, CONTEXT); // Assumes global
  }
}

// =============================================================================
// CACHE INVALIDATION HELPER (Local to this manager)
// =============================================================================
function _am_invalidateScheduleCacheForBlock(sheetName, year, weekNumber) {
    const CONTEXT = "AvailabilityManager._am_invalidateScheduleCacheForBlock";
    try {
        const cache = CacheService.getScriptCache();
        const cacheKey = `scheduleData_${sheetName}_${year}_W${weekNumber}`;
        cache.remove(cacheKey);
    } catch (e) {
        Logger.log(`Error in ${CONTEXT} for ${sheetName} ${year}-W${weekNumber}: ${e.message}`);
    }
}