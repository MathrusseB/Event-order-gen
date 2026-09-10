// The guests section — BUILD-SPEC §4 [v9], §5 (v9 changes).
//
// One section where `attendees` and `accommodations` were two. They were two
// headings about the same people, printed one after the other: a table of who
// is coming, then a table of how many rooms that filled per night. The second
// is gone from the order — where the whole rooming picture is wanted,
// `meta.includeInOrder.rooming` puts the grid itself on the order (§5, v9
// changes) — and what is left is the line every order needs at the top of its
// guest list: which buildings this event is using, and which are being held
// back in case it grows.
//
// The attendee rows themselves are unchanged and are not reimplemented here.
// This mounts the editor that already exists, under the buildings control, so
// there is one guest-row editor in the app and the counts, the daily tallies
// and the dietary line all keep working exactly as they did.
//
// Buildings are picked, never typed (§6): the registry is property data, and a
// coordinator who types "Wigen" into a list that also holds "Wigeon" has made a
// building nobody can find. A file naming something the registry does not carry
// keeps it and shows it, checked, at the end of the list — the same rule the
// rooming editor follows for a building that has left the registry.
//
// [v13] AND THE LIST IS GROUPED, which is what the groups in the registry are
// for (§6 [v13]). Eleven checkboxes in an auto-filling grid wrap wherever the
// column happens to end: Remington in one column and Winchester in the next,
// Pintail beside a Lodge room, the cottages in two pieces. A coordinator
// looking for "the cottages" is looking for a set, so each group is drawn under
// its own heading and laid out on its own — a group of two is a row of two, and
// nothing is ever cut in half by a column boundary.

import { update } from '../app.js';
import { buildingsSentence } from '../derive.js';
import { BUILDINGS, LODGING_GROUPS } from '../reference.js';
import { el, reconcile, setChecked, setHidden, setText } from '../dom.js';
import { createAttendeesEditor } from './attendees.js';

/** The two lists this section edits, both of them on the event. §5 [v9]. */
const LISTS = [
  {
    key: 'buildingsInUse',
    label: 'In use',
    hint: 'The buildings this event is using — lodging and everywhere else it goes.'
  },
  {
    key: 'overflowBuildings',
    label: 'Held for overflow',
    hint: 'Kept back in case the party grows. Named on the order so nobody lets them out.'
  }
];

/** Write a building into or out of one of the lists. The only write path here. */
function toggleBuilding(key, building, on) {
  update((draft) => {
    if (!Array.isArray(draft[key])) draft[key] = [];
    const list = draft[key];
    const index = list.indexOf(building);
    if (on && index < 0) list.push(building);
    if (!on && index >= 0) list.splice(index, 1);
  });
}

/**
 * The guests section editor.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createGuestsEditor(section) {
  const lists = LISTS.map(createBuildingList);

  const preview = el('p', { class: 'buildings__preview' });
  const previewNone = el('p', {
    class: 'buildings__none',
    text: 'Nothing named yet. Tick the buildings this event is using and the line above the guest '
      + 'list writes itself.'
  });

  const attendees = createAttendeesEditor(section);

  const node = el('div', { class: 'editor editor--guestsection' }, [
    el('div', { class: 'buildings' }, [
      el('h3', { class: 'buildings__head', text: 'Buildings' }),
      el('div', { class: 'buildings__lists' }, lists.map((list) => list.node)),
      preview,
      previewNone
    ]),
    attendees.node
  ]);

  return {
    node,
    update(event, current) {
      for (const list of lists) list.update(event);

      // The line the order will print, exactly as it will print it — the same
      // string from the same function, so the preview cannot drift from the
      // page (§7 [v9]).
      const sentence = buildingsSentence(event);
      setText(preview, sentence);
      setHidden(preview, !sentence);
      setHidden(previewNone, Boolean(sentence));

      attendees.update(event, current);
    }
  };
}

/**
 * [v13] The heading a group of buildings the registry no longer carries is
 * drawn under. Named rather than empty: a checked box under no heading at all
 * reads as part of whatever is above it.
 */
const UNKNOWN_GROUP = 'Named in this file';

/**
 * One list of buildings, as checkboxes over the registry, in its groups.
 *
 * The two lists are not exclusive of one another on purpose. A building can be
 * in use and still be holding a room back, and a control that refused to let
 * both be ticked would be enforcing a rule the property does not have.
 */
function createBuildingList({ key, label, hint }) {
  const groups = el('div', { class: 'buildings__groups' });
  const node = el('fieldset', { class: 'buildings__list' }, [
    el('legend', { class: 'buildings__legend', text: label }),
    el('p', { class: 'buildings__hint', text: hint }),
    groups
  ]);

  return {
    node,
    update(event) {
      const stored = Array.isArray(event[key]) ? event[key] : [];
      // A building the file names that this build's registry does not carry is
      // offered rather than dropped: it was authored that way, §6 [v13] retired
      // names that files in hand still use, and §12.13 is what says so.
      const extra = stored.filter((building) => !BUILDINGS.includes(building));
      const offered = extra.length
        ? [...LODGING_GROUPS, { name: UNKNOWN_GROUP, buildings: extra }]
        : LODGING_GROUPS;

      const entries = reconcile(groups, offered, (group) => group.name, () =>
        createBuildingGroup(key));
      entries.forEach((entry, index) => entry.update(offered[index], stored));
    }
  };
}

/** [v13] One group of buildings, under its own heading and on its own grid. */
function createBuildingGroup(key) {
  const heading = el('h4', { class: 'buildinggroup__name' });
  const boxes = el('div', { class: 'buildings__set' });
  const node = el('div', { class: 'buildinggroup' }, [heading, boxes]);

  return {
    node,
    update(group, stored) {
      setText(heading, group.name);
      const entries = reconcile(boxes, group.buildings, (building) => building, (building) =>
        createBuildingBox(key, building));
      entries.forEach((entry, index) => entry.update(stored.includes(group.buildings[index])));
    }
  };
}

/** One building's checkbox. */
function createBuildingBox(key, building) {
  const input = el('input', { type: 'checkbox', class: 'check__box' });
  input.addEventListener('change', () => toggleBuilding(key, building, input.checked));

  const node = el('label', { class: 'check check--building' }, [
    input,
    el('span', { class: 'check__label', text: building })
  ]);

  return {
    node,
    update(on) {
      setChecked(input, on);
    }
  };
}
