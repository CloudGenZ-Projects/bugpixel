/**
 * New change-request flow entry point. The website picker (task 14) and the
 * change composer (task 15) plug in here. This module is expanded in those
 * tasks; for now it renders the WebsitePicker which drives composition.
 */
import { WebsitePicker } from "./WebsitePicker.js";

export function NewChangeRequest() {
  return <WebsitePicker />;
}
