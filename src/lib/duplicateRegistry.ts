// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';

export interface SectionDef {
  id: string;
  label: string;
  collection: string;
  // function that, given a doc, returns array of { name, nationalId, phone? } sub-entries
  extract: (d: any) => Array<{ name: string; nationalId: string; phone?: string; subKey?: string }>;
  route: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'cases',
    label: 'الحالات',
    collection: 'cases',
    route: '/cases',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'reception',
    label: 'الاستقبال',
    collection: 'reception_cases',
    route: '/reception',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'seasonal',
    label: 'الحالات الموسمية',
    collection: 'seasonal_cases',
    route: '/seasonal',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'marriage',
    label: 'حالات الزواج',
    collection: 'marriageCases',
    route: '/marriage',
    extract: (d) => [{ name: d.brideName || '', nationalId: d.brideNationalId || '', phone: d.bridePhone || d.guardianPhone || '' }],
  },
  {
    id: 'orphans',
    label: 'هيئة الأعمال',
    collection: 'orphans',
    route: '/orphans',
    extract: (d) => {
      const out: any[] = [];
      if (d.guardianName) out.push({ name: d.guardianName, nationalId: d.guardianId || '', phone: d.guardianPhone || d.phone || '', subKey: 'guardian' });
      (d.orphans || []).forEach((o: any, i: number) => {
        if (o?.name) out.push({ name: o.name, nationalId: o.id || '', phone: '', subKey: `orphan-${i}` });
      });
      return out;
    },
  },
  {
    id: 'payroll',
    label: 'كشف القبض الشهري',
    collection: 'monthly_payroll_lists',
    route: '/payroll',
    extract: (d) => (d.items || []).map((it: any, i: number) => ({
      name: it.name || '', nationalId: it.nationalId || '', phone: it.phone || '', subKey: `item-${i}`,
    })),
  },
];

export interface RegistryEntry {
  sectionId: string;
  sectionLabel: string;
  collection: string;
  docId: string;
  name: string;
  nationalId: string;
  phone: string;
  subKey?: string;
  raw: any;
}

const normalizeName = (s: string) =>
  (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeNid = (s: string) => (s || '').replace(/[^0-9]/g, '');

export function useDuplicateRegistry() {
  const [bySection, setBySection] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let loaded = 0;
    SECTIONS.forEach((s) => {
      const u = onSnapshot(
        collection(db, s.collection),
        (snap) => {
          const arr = snap.docs.map((d) => ({ __id: d.id, ...(d.data() as any) }));
          setBySection((prev) => ({ ...prev, [s.id]: arr }));
          loaded++;
          if (loaded >= SECTIONS.length) setLoading(false);
        },
        (e) => { console.warn('registry sub error', s.id, e); loaded++; if (loaded >= SECTIONS.length) setLoading(false); }
      );
      unsubs.push(u);
    });
    return () => unsubs.forEach((u) => u());
  }, []);

  const entries = useMemo<RegistryEntry[]>(() => {
    const out: RegistryEntry[] = [];
    SECTIONS.forEach((s) => {
      (bySection[s.id] || []).forEach((d: any) => {
        s.extract(d).forEach((e) => {
          if (!e.name && !e.nationalId) return;
          out.push({
            sectionId: s.id,
            sectionLabel: s.label,
            collection: s.collection,
            docId: d.__id,
            name: e.name,
            nationalId: e.nationalId,
            phone: e.phone || '',
            subKey: e.subKey,
            raw: d,
          });
        });
      });
    });
    return out;
  }, [bySection]);

  // groups: key -> entries (only groups with >1)
  const duplicateGroups = useMemo(() => {
    const byNid = new Map<string, RegistryEntry[]>();
    const byName = new Map<string, RegistryEntry[]>();
    entries.forEach((e) => {
      const nid = normalizeNid(e.nationalId);
      const nm = normalizeName(e.name);
      if (nid && nid.length >= 6) {
        if (!byNid.has(nid)) byNid.set(nid, []);
        byNid.get(nid)!.push(e);
      }
      if (nm && nm.length >= 4) {
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm)!.push(e);
      }
    });
    const groups: { type: 'nid' | 'name'; key: string; entries: RegistryEntry[] }[] = [];
    byNid.forEach((arr, key) => { if (arr.length > 1) groups.push({ type: 'nid', key, entries: arr }); });
    byName.forEach((arr, key) => {
      if (arr.length > 1) {
        // skip if already in nid group with same set
        const sameNid = arr.every((e) => e.nationalId && arr[0].nationalId && normalizeNid(e.nationalId) === normalizeNid(arr[0].nationalId));
        if (!sameNid) groups.push({ type: 'name', key, entries: arr });
      }
    });
    return groups;
  }, [entries]);

  // lookup helper for "where else does this person exist"
  const lookup = (name: string, nationalId: string, excludeDocId?: string): RegistryEntry[] => {
    const nid = normalizeNid(nationalId);
    const nm = normalizeName(name);
    return entries.filter((e) => {
      if (e.docId === excludeDocId) return false;
      if (nid && nid.length >= 6 && normalizeNid(e.nationalId) === nid) return true;
      if (nm && nm.length >= 4 && normalizeName(e.name) === nm) return true;
      return false;
    });
  };

  return { entries, duplicateGroups, lookup, loading, bySection };
}

// move a case (entry.raw) into another section; copies common fields, deletes source if move=true
export async function transferEntry(
  entry: RegistryEntry,
  targetSectionId: string,
  mode: 'copy' | 'move'
): Promise<void> {
  const target = SECTIONS.find((s) => s.id === targetSectionId);
  if (!target) throw new Error('قسم غير معروف');

  const base: any = {
    createdAt: serverTimestamp(),
    transferredFrom: entry.sectionId,
    transferredAt: new Date().toISOString(),
  };

  // map fields per target schema
  if (target.id === 'marriage') {
    base.brideName = entry.name;
    base.brideNationalId = entry.nationalId;
    base.bridePhone = entry.phone;
  } else if (target.id === 'orphans') {
    base.guardianName = entry.name;
    base.guardianId = entry.nationalId;
    base.guardianPhone = entry.phone;
    base.orphans = [];
  } else if (target.id === 'payroll') {
    // append to a new list
    base.title = `كشف منقول من ${entry.sectionLabel}`;
    base.date = new Date().toISOString().slice(0, 10);
    base.items = [{
      id: Math.random().toString(36).slice(2, 10),
      name: entry.name,
      nationalId: entry.nationalId,
      phone: entry.phone,
      maritalStatus: '',
      amount: 0,
    }];
  } else {
    base.name = entry.name;
    base.nationalId = entry.nationalId;
    base.phone = entry.phone;
    base.status = 'pending';
  }

  await addDoc(collection(db, target.collection), base);
  if (mode === 'move') {
    // only delete if source entry IS a top-level doc (not a sub-item like payroll item or orphan child)
    if (!entry.subKey || entry.subKey === 'guardian') {
      await deleteDoc(doc(db, entry.collection, entry.docId));
    }
  }
}

export async function checkDuplicateCase(name: string, nationalId: string): Promise<string[]> {
  const normalizedInputName = (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedInputNid = (nationalId || '').trim();

  if (!normalizedInputName && !normalizedInputNid) return [];

  const checkTargets = [
    { coll: 'cases', nameField: 'name', idField: 'nationalId', label: 'الحالات العامة' },
    { coll: 'reception_cases', nameField: 'name', idField: 'nationalId', label: 'الاستقبال' },
    { coll: 'marriageCases', nameField: 'brideName', idField: 'brideNationalId', label: 'حالات الزواج' },
    { coll: 'orphans', nameField: 'guardianName', idField: 'guardianId', label: 'كفالة الأيتام' },
    { coll: 'medicalCases', nameField: 'name', idField: 'nationalId', label: 'الحالات الطبية' },
    { coll: 'seasonal_cases', nameField: 'name', idField: 'nationalId', label: 'الحالات الموسمية' },
  ];

  const results: string[] = [];

  const promises = checkTargets.map(async (target) => {
    // 1. Check by ID if provided and has valid length
    if (normalizedInputNid && normalizedInputNid.length >= 6) {
      const qId = query(collection(db, target.coll), where(target.idField, '==', normalizedInputNid), limit(1));
      const snapId = await getDocs(qId);
      if (!snapId.empty) {
        const firstDoc = snapId.docs[0].data();
        const docName = firstDoc[target.nameField] || '';
        results.push(`قائمة "${target.label}" بنفس الرقم القومي (${docName})`);
        return; // skip name check if ID matched in this collection
      }
    }

    // 2. Check by exact name match (normalized)
    if (normalizedInputName && normalizedInputName.length >= 4) {
      const qName = query(collection(db, target.coll), where(target.nameField, '==', name.trim()), limit(1));
      const snapName = await getDocs(qName);
      if (!snapName.empty) {
        results.push(`قائمة "${target.label}" بنفس الاسم`);
      }
    }
  });

  await Promise.all(promises);
  return results;
}
