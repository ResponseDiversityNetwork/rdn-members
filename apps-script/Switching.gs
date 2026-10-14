/**
 * Switching between the two forms.
 *
 * Every email to a member includes a link to the OTHER form with their current
 * answers prefilled, including a secret member reference. When a response
 * arrives with a member reference we know, the automation (next step) moves
 * the member to that response, deletes the old response (and, when switching
 * to the no-photo form, the photos), and emails a new personal link.
 *
 * The member reference is a random token that only appears in emails to the member.
 * It is never published.
 */

/** A new random member reference. */
function newMemberRef_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

/**
 * A prefilled link to targetForm, copying the answers in fromResponse.
 * Answers that don't exist in the target (e.g. the "Photo" display option
 * when going to Form A, or the upload itself) are skipped.
 */
function switchLink_(fromResponse, targetForm, memberRef) {
  const answers = {};
  fromResponse.getItemResponses().forEach(r => { answers[r.getItem().getTitle()] = r.getResponse(); });
  answers[Q.MEMBER_REF] = memberRef;
  delete answers[Q.LEAVE];
  return prefillUrl_(targetForm, answers);
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

/**
 * Manual test: submit Form A once, then run this. It logs the
 * "add a photo" link for that response. Open it: your answers should be
 * filled in on the photo form, with a member reference on the last page.
 */
function testSwitchLink() {
  const formA = FormApp.openById(prop_('FORM_A_ID'));
  const formB = FormApp.openById(prop_('FORM_B_ID'));
  const responses = formA.getResponses();
  if (!responses.length) throw new Error('Submit the no-photo form once first.');
  Logger.log('Add-a-photo link: ' + switchLink_(responses[responses.length - 1], formB, 'TEST-REF-123'));
}
