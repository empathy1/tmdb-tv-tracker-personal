import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  // Su Android il canale deve essere creato prima di richiedere i permessi.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("calendar", {
      name: "Calendario",
      description: "Avvisi per film in uscita e première delle serie",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#01B4E4",
    });
  }

  const { status: currentStatus } = await Notifications.getPermissionsAsync();

  let finalStatus = currentStatus;

  if (currentStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

export type CalendarNotificationItem = {
  id: string;
  type: "movie" | "episode";
  categories: ("movie" | "premiere" | "finale" | "episode")[];
  title: string;
  release_date: string;
  episode_title?: string;
  season_number?: number;
  episode_number?: number;
};

export async function scheduleCalendarNotifications(
  items: CalendarNotificationItem[],
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();

  if (status !== "granted") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  // Rimuove solo gli avvisi precedentemente creati dal calendario.
  for (const notification of scheduled) {
    if (notification.content.data?.source === "calendar") {
      await Notifications.cancelScheduledNotificationAsync(
        notification.identifier,
      );
    }
  }

  const now = new Date();

  const events = items.filter(
    (item) =>
      item.type === "movie" ||
      (item.type === "episode" && item.categories.includes("premiere")),
  );

  for (const item of events) {
    const [year, month, day] = item.release_date.split("-").map(Number);

    if (!year || !month || !day) continue;

    // Orario locale del telefono: le 09:00 del giorno di uscita.
    const notificationDate = new Date(year, month - 1, day, 9, 0, 0);

    // Non programma notifiche nel passato o dopo le 09:00 di oggi.
    if (notificationDate <= now) continue;

    const isMovie = item.type === "movie";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: isMovie ? "Film in uscita" : "Première di stagione",
        body: isMovie
          ? `${item.title} esce oggi.`
          : `${item.title}: ${item.episode_title || "Nuovo episodio"} (S${item.season_number} E${item.episode_number}).`,
        data: {
          source: "calendar",
          itemId: item.id,
        },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationDate,
        channelId: "calendar",
      },
    });
  }
  const scheduledNotifications =
    await Notifications.getAllScheduledNotificationsAsync();

  const calendarNotifications = scheduledNotifications.filter(
    (notification) => notification.content.data?.source === "calendar",
  );

  console.log(
    `Notifiche calendario programmate: ${calendarNotifications.length}`,
  );

  calendarNotifications.forEach((notification) => {
    console.log(notification.content.title, notification.trigger);
  });
}
