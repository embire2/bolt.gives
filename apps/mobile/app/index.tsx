import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();

  const features = [
    { icon: 'chatbubbles', label: 'AI Chat', route: '/chat' },
    { icon: 'code-slash', label: 'Code Editor', route: '/editor' },
    { icon: 'eye', label: 'Preview', route: '/preview' },
    { icon: 'git-branch', label: 'Git Insights', route: '/git' },
  ];

  return (
    <LinearGradient
      colors={['#450A0A', '#0A0A0A', '#051937']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>⚡</Text>
        <Text style={styles.title}>bolt.gives</Text>
        <Text style={styles.subtitle}>AI-Powered Development</Text>
      </View>

      <View style={styles.features}>
        {features.map((feature, index) => (
          <TouchableOpacity
            key={index}
            style={styles.featureCard}
            onPress={() => router.push(feature.route as any)}
          >
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon as any} size={28} color="#8A5FFF" />
            </View>
            <Text style={styles.featureLabel}>{feature.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.startButton} onPress={() => router.push('/chat')}>
        <Text style={styles.startButtonText}>Start New Project</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#A3A3A3',
    marginTop: 4,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 40,
  },
  featureCard: {
    width: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138, 95, 255, 0.2)',
  },
  featureIcon: {
    marginBottom: 12,
  },
  featureLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8A5FFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 'auto',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
