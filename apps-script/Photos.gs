/**
 * Photos. Members upload through Form B. Google stores the original privately
 * in this account's Drive ("... (File responses)" folder). For the map we publish
 * a small, re-encoded copy: Google's own thumbnail of the upload, which drops
 * hidden data in the file such as where the photo was taken.
 *
 * Needs the Drive advanced service: Services (+) → Drive API → Add (identifier "Drive").
 */

/**
 * Makes or replaces the public copy of a member's photo.
 * Returns its public URL, or null if Google hasn't made the thumbnail yet
 * (try again later; the automation retries on a timer).
 */
function publishPhoto_(uploadFileId, publicId) {
  const meta = Drive.Files.get(uploadFileId, {fields: 'thumbnailLink,mimeType'});
  if (!meta.thumbnailLink || !/^image\//.test(meta.mimeType || '')) return null;

  // The thumbnail link ends in "=s220"; ask for our size instead.
  const thumbUrl = meta.thumbnailLink.replace(/=s\d+$/, '') + '=s' + CONFIG.PHOTO_SIZE_PX;
  const resp = UrlFetchApp.fetch(thumbUrl, {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true,
  });
  const type = String(resp.getHeaders()['Content-Type'] || '');
  if (resp.getResponseCode() !== 200 || !type.startsWith('image/')) return null;

  deletePublicPhoto_(publicId);
  const folder = DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID'));
  const file = folder.createFile(resp.getBlob().setName(publicId + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

/** Removes the public copy of a member's photo, if there is one. */
function deletePublicPhoto_(publicId) {
  const it = DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID')).getFilesByName(publicId + '.jpg');
  while (it.hasNext()) it.next().setTrashed(true);
}

/** Removes a member's original uploads (the file IDs from their Form B response). */
function deleteUploads_(uploadFileIds) {
  (uploadFileIds || []).forEach(id => {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
  });
}

/**
 * Manual test: submit Form B once with a photo, then run this.
 * It publishes the newest upload as "test-photo" and logs the public link.
 * Open the link in a private browser window: you should see the small photo.
 */
function testPublishPhoto() {
  const form = FormApp.openById(prop_('FORM_B_ID'));
  const responses = form.getResponses();
  if (!responses.length) throw new Error('Submit the photo form once first.');
  const last = responses[responses.length - 1];
  const photo = last.getItemResponses().find(r => r.getItem().getTitle() === Q.PHOTO);
  if (!photo || !photo.getResponse().length) throw new Error('The newest response has no photo.');
  const url = publishPhoto_(photo.getResponse()[0], 'test-photo');
  Logger.log(url ? 'Public photo: ' + url : 'Thumbnail not ready yet. Wait a minute and run again.');
}
