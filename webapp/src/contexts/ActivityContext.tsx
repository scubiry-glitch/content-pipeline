import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Activity {
  id: string;
  type: 'create' | 'update' | 'delete' | 'status_change' | 'review' | 'export' | 'import';
  entityType: 'task' | 'asset' | 'report' | 'expert' | 'system';
  entityId?: string;
  entityName?: string;
  user?: string;
  details: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

interface ActivityContextType {
  activities: Activity[];
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void;
  getActivitiesByEntity: (entityType: string, entityId: string) => Activity[];
  getRecentActivities: (limit?: number) => Activity[];
  clearActivities: () => void;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

const STORAGE_KEY = 'activity_history';
const MAX_ACTIVITIES = 500;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.map((a: Activity) => ({
            ...a,
            timestamp: new Date(a.timestamp),
          }));
        } catch {
          return [];
        }
      }
    }
    return [];
  });

  const saveActivities = (newActivities: Activity[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newActivities));
  };

  const addActivity = useCallback(
    (activity: Omit<Activity, 'id' | 'timestamp'>) => {
      const newActivity: Activity = {
        ...activity,
        id: Date.now().toString(),
        timestamp: new Date(),
      };
      const updated = [newActivity, ...activities].slice(0, MAX_ACTIVITIES);
      setActivities(updated);
      saveActivities(updated);
    },
    [activities]
  );

  const getActivitiesByEntity = useCallback(
    (entityType: string, entityId: string) => {
      return activities.filter(
        (a) => a.entityType === entityType && a.entityId === entityId
      );
    },
    [activities]
  );

  const getRecentActivities = useCallback(
    (limit = 50) => {
      return activities.slice(0, limit);
    },
    [activities]
  );

  const clearActivities = useCallback(() => {
    setActivities([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActivityContext.Provider
      value={{
        activities,
        addActivity,
        getActivitiesByEntity,
        getRecentActivities,
        clearActivities,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const context = useContext(ActivityContext);
  if (context === undefined) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}
