import React from 'react';
import { useQuery } from 'react-query';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  LinearProgress,
  Alert
} from '@mui/material';
import {
  Storage,
  Dns,
  People,
  TrendingUp,
  CheckCircle,
  Error,
  Warning,
  Circle
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import axios from 'axios';

// Mock data - replace with real API calls
const fetchDashboardData = async () => {
  // This would be multiple API calls in a real app
  return {
    stats: {
      totalInstances: 45,
      runningInstances: 38,
      totalUsers: 23,
      totalServers: 3,
      monthlyRevenue: 4850.00,
      systemHealth: 98.5
    },
    recentActivity: [
      { id: 1, type: 'instance_created', user: 'john@example.com', timestamp: '2 minutes ago' },
      { id: 2, type: 'user_registered', user: 'sarah@company.com', timestamp: '15 minutes ago' },
      { id: 3, type: 'instance_stopped', user: 'mike@startup.io', timestamp: '1 hour ago' },
      { id: 4, type: 'server_maintenance', user: 'admin', timestamp: '3 hours ago' }
    ],
    usageData: [
      { name: 'Mon', instances: 35, users: 18 },
      { name: 'Tue', instances: 38, users: 19 },
      { name: 'Wed', instances: 42, users: 21 },
      { name: 'Thu', instances: 40, users: 22 },
      { name: 'Fri', instances: 45, users: 23 },
      { name: 'Sat', instances: 43, users: 23 },
      { name: 'Sun', instances: 38, users: 22 }
    ],
    serverStatus: [
      { name: 'Primary Server', status: 'healthy', load: 65, instances: 25 },
      { name: 'Secondary Server', status: 'healthy', load: 45, instances: 15 },
      { name: 'Development Server', status: 'warning', load: 85, instances: 5 }
    ]
  };
};

function StatCard({ title, value, icon, color = 'primary', subtitle }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="overline">
              {title}
            </Typography>
            <Typography variant="h4" component="div" color={color === 'primary' ? 'primary' : 'inherit'}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ color: `${color}.main` }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function ServerStatusCard({ server }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <CheckCircle color="success" />;
      case 'warning': return <Warning color="warning" />;
      case 'error': return <Error color="error" />;
      default: return <Circle />;
    }
  };

  return (
    <ListItem>
      <ListItemIcon>
        {getStatusIcon(server.status)}
      </ListItemIcon>
      <ListItemText
        primary={server.name}
        secondary={
          <Box>
            <Typography variant="body2" color="textSecondary">
              {server.instances} instances • {server.load}% load
            </Typography>
            <LinearProgress
              variant="determinate"
              value={server.load}
              sx={{ mt: 1, height: 4, borderRadius: 2 }}
              color={server.load > 80 ? 'warning' : 'success'}
            />
          </Box>
        }
      />
      <Chip
        label={server.status}
        color={getStatusColor(server.status)}
        size="small"
      />
    </ListItem>
  );
}

function Dashboard() {
  const { data, isLoading, error } = useQuery('dashboardData', fetchDashboardData, {
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  if (isLoading) {
    return <LinearProgress />;
  }

  if (error) {
    return (
      <Alert severity="error">
        Failed to load dashboard data. Please try again.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Instances"
            value={data.stats.totalInstances}
            icon={<Storage sx={{ fontSize: 40 }} />}
            subtitle={`${data.stats.runningInstances} running`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Users"
            value={data.stats.totalUsers}
            icon={<People sx={{ fontSize: 40 }} />}
            subtitle="This month"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Servers"
            value={data.stats.totalServers}
            icon={<Dns sx={{ fontSize: 40 }} />}
            subtitle="All regions"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Monthly Revenue"
            value={`$${data.stats.monthlyRevenue.toLocaleString()}`}
            icon={<TrendingUp sx={{ fontSize: 40 }} />}
            color="success"
            subtitle="+12% from last month"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Usage Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Usage Trends (Last 7 Days)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.usageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="instances"
                  stroke="#1976d2"
                  strokeWidth={2}
                  name="Instances"
                />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#dc004e"
                  strokeWidth={2}
                  name="Users"
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Server Status */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Server Status
            </Typography>
            <List>
              {data.serverStatus.map((server, index) => (
                <ServerStatusCard key={index} server={server} />
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <List>
              {data.recentActivity.map((activity) => (
                <ListItem key={activity.id}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={activity.type.replace('_', ' ')}
                          size="small"
                          variant="outlined"
                        />
                        <Typography variant="body2">
                          {activity.user}
                        </Typography>
                      </Box>
                    }
                    secondary={activity.timestamp}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* System Health */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Health
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h3" color="success.main" sx={{ mr: 1 }}>
                {data.stats.systemHealth}%
              </Typography>
              <CheckCircle color="success" />
            </Box>
            <LinearProgress
              variant="determinate"
              value={data.stats.systemHealth}
              sx={{ height: 8, borderRadius: 4 }}
              color="success"
            />
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              All systems operational
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;