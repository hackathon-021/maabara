'use client';

import { useState } from 'react';
import { ScanOrType } from '@/components/ScanOrType';

export default function ScanProbe() {
  const [codes, setCodes] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-4">
      <ScanOrType onCode={(c) => setCodes((prev) => [...prev, c])} hint="בדיקת סורק" />
      <pre className="rounded-card bg-surface p-4">{codes.join('\n')}</pre>
    </div>
  );
}
