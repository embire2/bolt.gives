import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const mockCommitData = [0, 2, 1, 3, 0, 5, 2, 4, 1, 3, 0, 2];
const mockContributors = [
  { login: 'johndoe', contributions: 150, avatar_url: '' },
  { login: 'janedoe', contributions: 120, avatar_url: '' },
  { login: 'dev1', contributions: 80, avatar_url: '' },
];

export default function GitScreen() {
  const [activeTab, setActiveTab] = useState<'activity' | 'contributors'>('activity');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Git Insights</Text>
        <TouchableOpacity style={styles.scanButton}>
          <Ionicons name="scan" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contributors' && styles.activeTab]}
          onPress={() => setActiveTab('contributors')}
        >
          <Text style={[styles.tabText, activeTab === 'contributors' && styles.activeTabText]}>
            Contributors
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'activity' ? (
          <>
            {/* Commit Chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Commit Activity</Text>
              <LineChart
                data={{
                  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                  datasets: [{ data: mockCommitData }],
                }}
                width={Dimensions.get('window').width - 48}
                height={180}
                chartConfig={{
                  backgroundColor: '#171717',
                  backgroundGradientFrom: '#171717',
                  backgroundGradientTo: '#171717',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(138, 95, 255, ${opacity})`,
                  labelColor: () => '#A3A3A3',
                  style: { borderRadius: 16 },
                  propsForDots: { r: '4', strokeWidth: '2', stroke: '#8A5FFF' },
                }}
                bezier
                style={styles.chart}
              />
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>247</Text>
                <Text style={styles.statLabel}>Commits</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>3</Text>
                <Text style={styles.statLabel}>Contributors</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>12</Text>
                <Text style={styles.statLabel}>Active Days</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Contributors List */}
            {mockContributors.map((contributor, index) => (
              <View key={index} style={styles.contributorCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{contributor.login.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.contributorInfo}>
                  <Text style={styles.contributorName}>{contributor.login}</Text>
                  <Text style={styles.contributorContributions}>
                    {contributor.contributions} contributions
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Quick Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="document-text" size={20} color="#8A5FFF" />
            <Text style={styles.actionText}>Generate Docs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="git-compare" size={20} color="#8A5FFF" />
            <Text style={styles.actionText}>Compare</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A5FFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#8A5FFF',
  },
  tabText: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#8A5FFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#A3A3A3',
    fontSize: 12,
    marginTop: 4,
  },
  contributorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8A5FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contributorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  contributorName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  contributorContributions: {
    color: '#737373',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
  },
});
