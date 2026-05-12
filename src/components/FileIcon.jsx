import { FileArchive, FileImage, FileText } from 'lucide-react';

export function FileIcon({ type }) {
  if (type === 'image') return <FileImage size={17} />;
  if (type === 'archive') return <FileArchive size={17} />;
  return <FileText size={17} />;
}
