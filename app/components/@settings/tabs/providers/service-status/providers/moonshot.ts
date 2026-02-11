import { BaseProviderChecker } from '~/components/@settings/tabs/providers/service-status/base-provider';
import type { StatusCheckResult } from '~/components/@settings/tabs/providers/service-status/types';

export class MoonshotStatusChecker extends BaseProviderChecker {
  async checkStatus(): Promise<StatusCheckResult> {
    try {
      // Check Moonshot API endpoint
      const apiEndpoint = 'https://api.moonshot.ai/v1/models';
      const apiStatus = await this.checkEndpoint(apiEndpoint);

      // Check their main website
      const websiteStatus = await this.checkEndpoint('https://www.moonshot.ai');

      let status: StatusCheckResult['status'] = 'operational';
      let message = 'All systems operational';

      if (apiStatus !== 'reachable' || websiteStatus !== 'reachable') {
        status = apiStatus !== 'reachable' ? 'down' : 'degraded';
        message = apiStatus !== 'reachable' ? 'API appears to be down' : 'Service may be experiencing issues';
      }

      return {
        status,
        message,
        incidents: [], // No public incident tracking available yet
      };
    } catch (error) {
      console.error('Error checking Moonshot status:', error);

      return {
        status: 'degraded',
        message: 'Unable to determine service status',
        incidents: ['Note: Limited status information available'],
      };
    }
  }
}
