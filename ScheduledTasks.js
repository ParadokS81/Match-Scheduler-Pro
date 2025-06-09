/**
 * Schedule Manager - Scheduled Tasks (Web App Edition)
 *
 * @version 1.0.0 (2025-05-30) - Phase 1D
 *
 * Description: Handles automated, time-driven tasks like ensuring future week blocks are provisioned
 * for all active team availability sheets.
 */

// =============================================================================
// CONFIGURATION FOR TRIGGERS
// =============================================================================
const DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME = "performDailyMaintenanceTasks";
const WEEK_PROVISIONING_HANDLER_FUNCTION_NAME = "ensureFutureWeekBlocksForAllActiveTeams";


// =============================================================================
// MAIN DAILY MAINTENANCE TASK (Can call multiple sub-tasks)
// =============================================================================
function performDailyMaintenanceTasks() {
    const CONTEXT = "ScheduledTasks.performDailyMaintenanceTasks";
    Logger.log(`======== ${CONTEXT}: Starting Daily Maintenance ========`);
    
    try {
        ensureFutureWeekBlocksForAllActiveTeams();
        // Other daily tasks can be added here in the future
        // e.g., cleanupOldArchivedData(), sendSummaryReports(), etc.
    } catch (e) {
        Logger.log(`CRITICAL ERROR in ${CONTEXT}: ${e.message}\nStack: ${e.stack}`);
    }
    Logger.log(`======== ${CONTEXT}: Daily Maintenance Finished ========`);
}


// =============================================================================
// WEEK BLOCK PROVISIONING TASK
// =============================================================================

// In ScheduledTasks.js

// ... (DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME and WEEK_PROVISIONING_HANDLER_FUNCTION_NAME constants as before)
// ... (performDailyMaintenanceTasks function as before)

/**
 * Iterates through all active teams and ensures that their availability sheets
 * have structures for the current week up to (MAX_WEEKS_PER_TEAM - 1) future weeks.
 * Designed to be run by a time-driven trigger (e.g., daily or weekly).
 */
function ensureFutureWeekBlocksForAllActiveTeams() {
  const CONTEXT = "ScheduledTasks.ensureFutureWeekBlocksForAllActiveTeams";
  Logger.log(`---------------- ${CONTEXT}: Starting ----------------`);
  try {
    // CORRECTED: Direct call to global getAllTeams (from TeamDataManager.js)
    const teamsResult = getAllTeams(true); // onlyActive = true
    if (!teamsResult.success || !teamsResult.teams) { // Ensure .teams exists as per TeamDataManager.getAllTeams structure
      Logger.log(`${CONTEXT}: Could not retrieve active teams. Error: ${teamsResult.message}`);
      return;
    }

    const activeTeams = teamsResult.teams; // Access teams directly
    if (activeTeams.length === 0) {
      Logger.log(`${CONTEXT}: No active teams found. Nothing to process.`);
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const currentCetDate = getCurrentCETDate(); // Assumes global from Configuration.js
    const initialYear = currentCetDate.getFullYear();
    const initialWeekNum = getISOWeekNumber(currentCetDate); // Assumes global from Configuration.js

    // Assumes BLOCK_CONFIG is global from Configuration.js
    const totalWeeksToEnsure = BLOCK_CONFIG.TEAM_SETTINGS.MAX_WEEKS_PER_TEAM || 4;

    Logger.log(`${CONTEXT}: Current Year: ${initialYear}, Current Week: ${initialWeekNum}. Ensuring ${totalWeeksToEnsure} total weeks (current + ${totalWeeksToEnsure-1} future) are provisioned for each active team.`);

    let teamsProcessedCount = 0;
    let blocksCreatedTotalCount = 0;
    let teamsWithErrorsCount = 0;

    for (const team of activeTeams) {
      const teamId = team.teamId;
      const teamAvailabilitySheetName = team.availabilitySheetName;

      if (!teamAvailabilitySheetName) {
        Logger.log(`${CONTEXT}: Team ${teamId} (${team.teamName}) has no availability sheet name configured. Skipping.`);
        teamsWithErrorsCount++;
        continue;
      }

      Logger.log(`${CONTEXT}: Processing team ${teamId} (${team.teamName}) - Sheet: ${teamAvailabilitySheetName}`);
      const teamSheet = ss.getSheetByName(teamAvailabilitySheetName);
      if (!teamSheet) {
        Logger.log(`${CONTEXT}: Availability sheet '${teamAvailabilitySheetName}' for team ${teamId} not found. Skipping.`);
        teamsWithErrorsCount++;
        continue;
      }

      let blocksCreatedForThisTeam = 0;
      let currentProcessingYear = initialYear;
      let currentProcessingWeek = initialWeekNum;

      for (let i = 0; i < totalWeeksToEnsure; i++) {
        // Assumes ensureWeekExists is global from WeekBlockManager.js
        const result = ensureWeekExists(teamSheet, currentProcessingYear, currentProcessingWeek);

        if (result.success) {
            if (result.created) {
              blocksCreatedForThisTeam++;
              Logger.log(`${CONTEXT}: Created block for Team ${teamId}, Year ${currentProcessingYear}, Week ${currentProcessingWeek} on sheet '${teamAvailabilitySheetName}'.`);
            }
        } else {
           Logger.log(`${CONTEXT}: FAILED to ensure/create block for Team ${teamId}, Year ${currentProcessingYear}, Week ${currentProcessingWeek}. Error: ${result.message}`);
        }

        // Assumes getMondayFromWeekNumberAndYear and getISOWeekNumber are global from Configuration.js
        const mondayOfCurrentProcessingWeek = getMondayFromWeekNumberAndYear(currentProcessingYear, currentProcessingWeek);
        const nextWeekMonday = new Date(mondayOfCurrentProcessingWeek);
        nextWeekMonday.setDate(mondayOfCurrentProcessingWeek.getDate() + 7);

        currentProcessingYear = nextWeekMonday.getFullYear();
        currentProcessingWeek = getISOWeekNumber(nextWeekMonday);
      }

      if (blocksCreatedForThisTeam > 0) {
        Logger.log(`${CONTEXT}: Created ${blocksCreatedForThisTeam} new week block(s) for team ${teamId}.`);
        blocksCreatedTotalCount += blocksCreatedForThisTeam;
      }
      teamsProcessedCount++;
    }
    Logger.log(`---------------- ${CONTEXT}: Finished. ----------------`);
    Logger.log(`Processed ${teamsProcessedCount} active teams.`);
    Logger.log(`Created ${blocksCreatedTotalCount} new week blocks in total.`);
    if (teamsWithErrorsCount > 0) {
        Logger.log(`Encountered errors with ${teamsWithErrorsCount} teams (sheet not found or no sheet name).`);
    }
    Logger.log(`----------------------------------------------------`);

  } catch (e) {
    // This catch block is for errors within ensureFutureWeekBlocksForAllActiveTeams itself
    Logger.log(`CRITICAL ERROR in ${CONTEXT}: ${e.message}\nStack: ${e.stack}`);
    // Unlike service functions returning to an API, a scheduled task might not "return" an error object
    // in the same way. Logging the error is key. If this function was called by another that
    // expected a structured response, it would be: return handleError(e, CONTEXT);
  }
}

// ... (Trigger management functions as before) ...

// =============================================================================
// TRIGGER MANAGEMENT (Run manually by admin once to set up)
// =============================================================================

/**
 * Sets up a daily time-driven trigger for the main maintenance handler.
 */
function setupDailyMaintenanceTrigger() {
  const CONTEXT = "ScheduledTasks.setupDailyMaintenanceTrigger";
  // Delete any existing triggers for this function to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`${CONTEXT}: Deleted existing trigger for ${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME}`);
    }
  }

  // Create a new trigger to run daily (e.g., around 2-3 AM in script's timezone)
  ScriptApp.newTrigger(DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME)
    .timeBased()
    .everyDays(1) // Run daily
    .atHour(2)    // e.g., at 2 AM. Adjust as needed.
    .create();
  Logger.log(`${CONTEXT}: Setup daily trigger for ${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME} to run around 2 AM.`);
  
  // Inform the admin via UI if possible (only works if run from script editor)
  try {
    SpreadsheetApp.getUi().alert("Success", `Daily maintenance trigger ('${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME}') has been set up to run around 2 AM.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(uiError) {
    Logger.log(`${CONTEXT}: Could not show UI alert for trigger setup (probably run automatically).`);
  }
}

/**
 * Deletes all triggers for the main daily maintenance handler function.
 */
function deleteDailyMaintenanceTrigger() {
  const CONTEXT = "ScheduledTasks.deleteDailyMaintenanceTrigger";
  let deletedCount = 0;
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
      Logger.log(`${CONTEXT}: Deleted trigger ID ${trigger.getUniqueId()} for ${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME}`);
    }
  }
  
  const message = deletedCount > 0 ? 
    `${deletedCount} daily maintenance trigger(s) for '${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME}' have been deleted.` :
    `No daily maintenance triggers found for '${DAILY_MAINTENANCE_HANDLER_FUNCTION_NAME}' to delete.`;
  Logger.log(`${CONTEXT}: ${message}`);
  
  try {
    SpreadsheetApp.getUi().alert("Trigger Info", message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(uiError) {
     Logger.log(`${CONTEXT}: Could not show UI alert for trigger deletion.`);
  }
}

/**
 * Lists all current project triggers in the logs.
 */
function listAllProjectTriggers() {
    const CONTEXT = "ScheduledTasks.listAllProjectTriggers";
    const triggers = ScriptApp.getProjectTriggers();
    if (triggers.length === 0) {
        Logger.log(`${CONTEXT}: No project triggers are currently set.`);
        return;
    }
    Logger.log(`${CONTEXT}: Listing ${triggers.length} project trigger(s):`);
    triggers.forEach(trigger => {
        Logger.log(`  - Handler: ${trigger.getHandlerFunction()}, Type: ${trigger.getEventType()}, ID: ${trigger.getUniqueId()}`);
        if (trigger.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
            // Future: more detailed clock trigger info if API allows
        }
    });
}