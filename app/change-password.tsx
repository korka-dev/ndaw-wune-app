import { SafeAreaView } from "react-native-safe-area-context";
import ChangePasswordScreen from "../src/screens/ChangePasswordScreen";

export default function ChangePassword() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      <ChangePasswordScreen />
    </SafeAreaView>
  );
}
