import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

const mockFiles = [
  { name: 'App.tsx', type: 'file', language: 'typescript' },
  { name: 'components', type: 'folder', language: null },
  { name: 'utils', type: 'folder', language: null },
  { name: 'package.json', type: 'file', language: 'json' },
  { name: 'tsconfig.json', type: 'file', language: 'json' },
];

export default function EditorScreen() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const getFileIcon = (file: typeof mockFiles[0]) => {
    if (file.type === 'folder') return 'folder';
    switch (file.language) {
      case 'typescript': return 'logo-typescript';
      case 'javascript': return 'logo-javascript';
      case 'json': return 'document';
      case 'css': return 'logo-css3';
      case 'html': return 'logo-html5';
      default: return 'document-text';
    }
  };

  return (
    <View style={styles.container}>
      {/* File Explorer */}
      <View style={styles.fileExplorer}>
        <View style={styles.fileExplorerHeader}>
          <Text style={styles.fileExplorerTitle}>Explorer</Text>
          <TouchableOpacity>
            <Ionicons name="refresh" size={20} color="#737373" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.fileList}>
          {mockFiles.map((file, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.fileItem,
                selectedFile === file.name && styles.fileItemSelected,
              ]}
              onPress={() => setSelectedFile(file.name)}
            >
              <Ionicons
                name={getFileIcon(file) as any}
                size={18}
                color={selectedFile === file.name ? '#8A5FFF' : '#A3A3A3'}
              />
              <Text
                style={[
                  styles.fileName,
                  selectedFile === file.name && styles.fileNameSelected,
                ]}
              >
                {file.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Code Editor Area */}
      <View style={styles.editor}>
        {selectedFile ? (
          <View style={styles.editorContent}>
            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>{selectedFile}</Text>
              <View style={styles.editorActions}>
                <TouchableOpacity style={styles.editorAction}>
                  <Ionicons name="save" size={18} color="#A3A3A3" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.editorAction}>
                  <Ionicons name="close" size={18} color="#A3A3A3" />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.codeContainer}>
              <Text style={styles.code}>
                {`// ${selectedFile}\n\nimport React from 'react';\n\nexport default function App() {\n  return (\n    <View>\n      <Text>Hello, bolt.gives!</Text>\n    </View>\n  );\n}`}
              </Text>
            </ScrollView>
          </View>
        ) : (
          <View style={styles.emptyEditor}>
            <Ionicons name="code-slash" size={48} color="#404040" />
            <Text style={styles.emptyText}>Select a file to edit</Text>
          </View>
        )}
      </View>

      {/* Bottom Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarButton}>
          <Ionicons name="play" size={20} color="#fff" />
          <Text style={styles.toolbarText}>Run</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <Ionicons name="terminal" size={20} color="#fff" />
          <Text style={styles.toolbarText}>Terminal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <Ionicons name="eye" size={20} color="#fff" />
          <Text style={styles.toolbarText}>Preview</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  fileExplorer: {
    width: 200,
    backgroundColor: '#171717',
    borderRightWidth: 1,
    borderRightColor: '#262626',
  },
  fileExplorerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  fileExplorerTitle: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  fileList: {
    flex: 1,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingLeft: 16,
    gap: 8,
  },
  fileItemSelected: {
    backgroundColor: 'rgba(138, 95, 255, 0.1)',
  },
  fileName: {
    color: '#A3A3A3',
    fontSize: 13,
  },
  fileNameSelected: {
    color: '#fff',
  },
  editor: {
    flex: 1,
  },
  editorContent: {
    flex: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    backgroundColor: '#171717',
  },
  editorTitle: {
    color: '#fff',
    fontSize: 14,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editorAction: {
    padding: 4,
  },
  codeContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 16,
  },
  code: {
    color: '#D4D4D4',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  emptyEditor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#737373',
    fontSize: 14,
    marginTop: 12,
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#171717',
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  toolbarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: '#262626',
  },
  toolbarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});
