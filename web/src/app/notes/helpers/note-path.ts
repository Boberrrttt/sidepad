import type { Note } from '@/app/shared/types';

export type NoteTreeNode =
  | { kind: 'folder'; path: string; name: string; children: NoteTreeNode[] }
  | { kind: 'note'; name: string; label: string };

export function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function buildNoteTree(notes: Note[]): NoteTreeNode[] {
  type FolderNode = {
    kind: 'folder';
    path: string;
    name: string;
    children: NoteTreeNode[];
    folders: Map<string, FolderNode>;
  };

  const rootFolders = new Map<string, FolderNode>();
  const rootNotes: Extract<NoteTreeNode, { kind: 'note' }>[] = [];

  function folderAt(
    parent: Map<string, FolderNode>,
    segments: string[],
    depth: number
  ): FolderNode {
    const name = segments[depth];
    const path = segments.slice(0, depth + 1).join('/');
    let folder = parent.get(name);

    if (!folder) {
      folder = {
        kind: 'folder',
        path,
        name,
        children: [],
        folders: new Map(),
      };
      parent.set(name, folder);
    }

    return folder;
  }

  for (const note of notes) {
    const segments = note.name.split('/');

    if (segments.length === 1) {
      rootNotes.push({ kind: 'note', name: note.name, label: note.name });
      continue;
    }

    let folders = rootFolders;
    let folder: FolderNode | null = null;

    for (let depth = 0; depth < segments.length - 1; depth++) {
      folder = folderAt(folders, segments, depth);
      folders = folder.folders;
    }

    folder!.children.push({
      kind: 'note',
      name: note.name,
      label: segments[segments.length - 1],
    });
  }

  function finalize(folder: FolderNode): NoteTreeNode {
    const nested = [...folder.folders.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(finalize);
    const notesOnly = folder.children
      .filter((child) => child.kind === 'note')
      .sort((left, right) => left.label.localeCompare(right.label));

    return {
      kind: 'folder',
      path: folder.path,
      name: folder.name,
      children: [...nested, ...notesOnly],
    };
  }

  const folders = [...rootFolders.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(finalize);
  const sortedNotes = [...rootNotes].sort((left, right) =>
    left.label.localeCompare(right.label)
  );

  return [...folders, ...sortedNotes];
}
