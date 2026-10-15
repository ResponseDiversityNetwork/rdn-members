/**
 * Pre-filled links: the photo-form link that every member email includes, and the generic
 * prefillUrl_() also used for invitations.
 *
 * The member reference is a random token that only appears in links sent to the member.
 * It is never published.
 */
/** A new random member reference. */
function newMemberRef_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

/** The member's link to the photo form, with their member reference filled in. */
function photoLink_(memberRef) {
  const answers = {};
  answers[Q.MEMBER_REF] = memberRef;
  return prefillUrl_(formFor_('B'), answers);
}

/**
 * A prefilled link to form. answers maps question titles to values
 * (a string, or an array for checkbox questions). Values that don't fit a
 * question (e.g. an option that doesn't exist) are left out.
 */
function prefillUrl_(form, answers) {
  const draft = form.createResponse();
  form.getItems().forEach(item => {
    const val = answers[item.getTitle()];
    if (val === undefined || val === null || val === '') return;
    switch (item.getType()) {
      case FormApp.ItemType.TEXT:
        draft.withItemResponse(item.asTextItem().createResponse(String(val))); break;
      case FormApp.ItemType.PARAGRAPH_TEXT:
        draft.withItemResponse(item.asParagraphTextItem().createResponse(String(val))); break;
      case FormApp.ItemType.MULTIPLE_CHOICE: {
        const mc = item.asMultipleChoiceItem();
        if (mc.getChoices().some(c => c.getValue() === val)) draft.withItemResponse(mc.createResponse(val));
        break;
      }
      case FormApp.ItemType.CHECKBOX: {
        const cb = item.asCheckboxItem();
        const ok = new Set(cb.getChoices().map(c => c.getValue()));
        const vals = [].concat(val).filter(v => ok.has(v));
        if (vals.length) draft.withItemResponse(cb.createResponse(vals));
        break;
      }
      default: break;   // file uploads can't be prefilled
    }
  });
  return draft.toPrefilledUrl();
}

/** Manual test: logs a photo-form link for a made-up reference. Open it: the reference should be filled in. */
function testPhotoLink() {
  Logger.log('Photo form link: ' + photoLink_('TEST-REF-123'));
}
