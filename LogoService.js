/**
 * Schedule Manager - Logo Service (Web App Edition)
 * * @version 1.0.1 (2025-05-30) - Phase 1D Refactor (Manager calls updated)
 * * Description: Handles team logo operations for web application.
 *
 * CHANGELOG:
 * 1.0.1 - 2025-05-30 - Ensured explicit calls to TeamDataManager.
 * 1.0.0 - 2025-05-30 - Phase 1C: Initial implementation for web app architecture.
 */

// =============================================================================
// LOGO FILE OPERATIONS
// =============================================================================

function uploadLogoFile(base64Data, fileName, mimeType, teamId) {
  const CONTEXT = "LogoService.uploadLogoFile";
  try {
    // Logger.log(`${CONTEXT}: Processing file upload for team ${teamId}: ${fileName} (${mimeType})`);
    
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const validation = validateLogoFile(blob); // from Configuration.js
    if (!validation.isValid) {
      return createErrorResponse(`File validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors });
    }
    
    const teamData = TeamDataManager.getTeamData(teamId); // UPDATED to be explicit
    if (!teamData) { // TeamDataManager.getTeamData returns null if not found
      return createErrorResponse(`Team not found: ${teamId}`);
    }
    
    const saveResult = saveTeamLogoToDrive(blob, teamData.teamName);
    if (!saveResult.success) return saveResult;
    
    const updateResult = updateTeamLogoUrl(teamId, saveResult.publicUrl); // Calls local updateTeamLogoUrl
    if (!updateResult.success) {
      Logger.log(`${CONTEXT}: Warning - Failed to update team logo URL in database: ${updateResult.message}`);
    }
    
    // Logger.log(`${CONTEXT}: File upload completed successfully for team ${teamId}: ${saveResult.publicUrl}`);
    return createSuccessResponse({
      teamId: teamId, teamName: teamData.teamName, logoUrl: saveResult.publicUrl, fileName: saveResult.fileName
    }, `Logo uploaded successfully for team "${teamData.teamName}"`);
    
  } catch (e) {
    return handleError(e, CONTEXT); // from Configuration.js
  }
}

function fetchAndSaveTeamLogo(imageUrl, teamId) {
  const CONTEXT = "LogoService.fetchAndSaveTeamLogo";
  try {
    // Logger.log(`${CONTEXT}: Fetching logo from ${imageUrl} for team ${teamId}`);
    
    const urlValidation = validateLogoUrl(imageUrl); // from Configuration.js
    if (!urlValidation.isValid) {
      return createErrorResponse(`URL validation failed: ${urlValidation.errors.join(', ')}`, { errors: urlValidation.errors });
    }
    
    const teamData = TeamDataManager.getTeamData(teamId); // UPDATED
    if (!teamData) {
      return createErrorResponse(`Team not found: ${teamId}`);
    }
    
    let response;
    try {
      response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true, followRedirects: true });
    } catch (e) {
      return createErrorResponse(`Failed to fetch image from URL: ${e.message}`);
    }
    
    if (response.getResponseCode() !== 200) {
      return createErrorResponse(`Failed to fetch image: HTTP ${response.getResponseCode()}`);
    }
    
    const imageBlob = response.getBlob();
    const validation = validateLogoFile(imageBlob);
    if (!validation.isValid) {
      return createErrorResponse(`Fetched file validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors });
    }
    
    const saveResult = saveTeamLogoToDrive(imageBlob, teamData.teamName);
    if (!saveResult.success) return saveResult;
    
    const updateResult = updateTeamLogoUrl(teamId, saveResult.publicUrl);
    if (!updateResult.success) {
      Logger.log(`${CONTEXT}: Warning - Failed to update team logo URL in database: ${updateResult.message}`);
    }
    
    // Logger.log(`${CONTEXT}: URL fetch completed for team ${teamId}: ${saveResult.publicUrl}`);
    return createSuccessResponse({
      teamId: teamId, teamName: teamData.teamName, logoUrl: saveResult.publicUrl,
      fileName: saveResult.fileName, originalUrl: imageUrl
    }, `Logo saved successfully from URL for team "${teamData.teamName}"`);
    
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function saveTeamLogoToDrive(imageBlob, teamName) {
  const CONTEXT = "LogoService.saveTeamLogoToDrive";
  try {
    const cleanTeamName = teamName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    let fileExtension = getExtensionFromContentType(imageBlob.getContentType()); // local helper
    if (!fileExtension) fileExtension = 'png'; 
    const fileName = `${cleanTeamName}.${fileExtension}`.substring(0, 250); // Ensure filename isn't too long

    let logoFolder;
    try {
      logoFolder = DriveApp.getFolderById(BLOCK_CONFIG.LOGO.DRIVE_FOLDER_ID);
    } catch (e) {
      return createErrorResponse(`Logo Drive folder not accessible: ${e.message}. Check ID: ${BLOCK_CONFIG.LOGO.DRIVE_FOLDER_ID}`);
    }
    
    deleteExistingTeamLogo(logoFolder, cleanTeamName); // local helper
    
    let file;
    try {
      file = logoFolder.createFile(imageBlob.setName(fileName));
    } catch (e) {
      return createErrorResponse(`Failed to create file in Drive: ${e.message}`);
    }
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log(`${CONTEXT}: Warning - Could not set public sharing for ${fileName}: ${e.message}`);
    }
    
    const publicUrl = `https://drive.google.com/uc?id=${file.getId()}`;
    // Logger.log(`${CONTEXT}: Successfully saved logo as ${fileName}, public URL: ${publicUrl}`);
    return createSuccessResponse({ publicUrl: publicUrl, fileName: fileName, fileId: file.getId(), teamName: teamName }, `Logo saved as ${fileName}`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function updateTeamLogoUrl(teamId, logoUrl = "") {
  const CONTEXT = "LogoService.updateTeamLogoUrl";
  try {
    // Logger.log(`${CONTEXT}: Updating logo URL for team ${teamId}: ${logoUrl}`);
    const validation = validateLogoUrl(logoUrl); // from Configuration.js
    if (!validation.isValid) {
      return createErrorResponse(`Invalid logo URL: ${validation.errors.join(', ')}`);
    }
    
    // Call TeamDataManager.updateTeam - requestingUserEmail assumed to be system or already validated by API layer
    const updateResult = TeamDataManager.updateTeam(teamId, { logoUrl: logoUrl.trim() }, BLOCK_CONFIG.ADMIN.SYSTEM_EMAIL); // UPDATED
    
    if (updateResult.success) {
      // Logger.log(`${CONTEXT}: ✅ Logo URL updated for team ${teamId}`);
      return createSuccessResponse({ teamId: teamId, logoUrl: logoUrl.trim() }, logoUrl ? "Logo URL updated." : "Logo URL cleared.");
    } else {
      return createErrorResponse(`Failed to update team record with logo URL: ${updateResult.message}`, updateResult);
    }
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

function deleteTeamLogo(teamId) {
  const CONTEXT = "LogoService.deleteTeamLogo";
  try {
    // Logger.log(`${CONTEXT}: Deleting logo for team ${teamId}`);
    const teamData = TeamDataManager.getTeamData(teamId); // UPDATED
    if (!teamData) {
      return createErrorResponse(`Team not found: ${teamId}`);
    }
    const currentLogoUrl = teamData.logoUrl;
    
    const clearDbResult = updateTeamLogoUrl(teamId, ""); // This calls TeamDataManager.updateTeam
    if (!clearDbResult.success) {
      Logger.log(`${CONTEXT}: Warning - Could not clear logo URL from database for ${teamId}: ${clearDbResult.message}`);
      // Continue to attempt Drive file deletion if URL was present
    }
    
    if (currentLogoUrl && currentLogoUrl.includes('drive.google.com')) {
      try {
        const fileIdMatch = currentLogoUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
          const fileId = fileIdMatch[1];
          DriveApp.getFileById(fileId).setTrashed(true);
          // Logger.log(`${CONTEXT}: Deleted logo file from Drive: ${fileId}`);
        }
      } catch (e) {
        Logger.log(`${CONTEXT}: Warning - Could not delete logo file from Drive (${currentLogoUrl}): ${e.message}`);
      }
    }
    
    // Logger.log(`${CONTEXT}: ✅ Logo deletion process completed for team ${teamId}`);
    return createSuccessResponse({ teamId: teamId, teamName: teamData.teamName, previousLogoUrl: currentLogoUrl }, 
      `Logo deletion process for team "${teamData.teamName}" completed.`);
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

// =============================================================================
// UTILITY FUNCTIONS (Local to LogoService)
// =============================================================================
function deleteExistingTeamLogo(folder, cleanTeamName) {
  // ... (implementation as provided by user, seems fine)
  try {
    const files = folder.getFiles();
    let deletedCount = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().startsWith(cleanTeamName + ".")) {
        file.setTrashed(true);
        deletedCount++;
      }
    }
    return { success: true, deletedCount: deletedCount };
  } catch (e) {
    Logger.log(`LogoService.deleteExistingTeamLogo: Warning - ${e.message}`);
    return { success: false, message: e.message };
  }
}

function getExtensionFromContentType(contentType) {
  // ... (implementation as provided by user, seems fine)
  const typeMap = {'image/png':'png', 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/gif':'gif', 'image/webp':'webp'};
  return typeMap[String(contentType).toLowerCase()] || null;
}

// =============================================================================
// PUBLIC GETTERS (Used by WebAppAPI typically)
// =============================================================================
function getTeamLogoUrl(teamId) { // Renamed to match usage in WebAppAPI
  const CONTEXT = "LogoService.getTeamLogoUrl";
  try {
    const teamData = TeamDataManager.getTeamData(teamId); // UPDATED
    if (!teamData) {
      return createErrorResponse(`Team not found: ${teamId}`);
    }
    const logoUrl = teamData.logoUrl || "";
    return createSuccessResponse({
      teamId: teamId, teamName: teamData.teamName, logoUrl: logoUrl, hasLogo: logoUrl.length > 0
    }, logoUrl ? "Logo URL retrieved" : "No logo set for this team");
  } catch (e) {
    return handleError(e, CONTEXT);
  }
}

// generateLogoHtml was in user's original file. It's more of a frontend/display helper.
// If it's needed by backend, it can stay, otherwise it might be removed from server-side.
// For now, let's assume it might be used for some server-side report generation or admin UI.

// debugLogoOperations - can be kept for testing.