import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

const recentProjects = [
  { id: '1', name: 'My App', date: 'Today', language: 'TypeScript' },
  { id: '2', name: 'Landing Page', date: 'Yesterday', language: 'JavaScript' },
  { id: '3', name: 'API Service', date: '2 days ago', language: 'TypeScript' },
];

export default function TabIndexScreen() {
  const router = useRouter();

  const renderProject = ({ item }: { item: typeof recentProjects[0] }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push('/chat')}
    >
      <View style={styles.projectIcon}>
        <Text style={styles.projectIconText}>{item.name.charAt(0)}</Text>
      </View>
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        <Text style={styles.projectMeta}>{item.date} • {item.language}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Projects</Text>
      <FlatList
        data={recentProjects}
        renderItem={renderProject}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#8A5FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  projectInfo: {
    marginLeft: 12,
    flex: 1,
  },
  projectName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  projectMeta: {
    color: '#737373',
    fontSize: 12,
    marginTop: 2,
  },
});
