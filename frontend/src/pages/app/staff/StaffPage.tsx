import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Button, PageHeader } from "../../../components/ui";
import { useDocumentTitle } from "../../../lib/hooks";
import { AddStaffModal } from "./AddStaffModal";
import { PeopleCard } from "./PeopleCard";
import { PermissionMatrix } from "./PermissionMatrix";
import styles from "./StaffPage.module.css";

export default function StaffPage() {
  useDocumentTitle("Staff");
  const [adding, setAdding] = useState(false);
  // A new key per open gives the Add staff form a fresh start (and a fresh password).
  const [addKey, setAddKey] = useState(0);

  const openAdd = () => {
    setAddKey((key) => key + 1);
    setAdding(true);
  };

  return (
    <>
      <PageHeader
        title="Staff"
        description="Give each person their own login and choose what they can see."
        actions={
          <Button variant="primary" icon={<UserPlus aria-hidden="true" />} onClick={openAdd}>
            Add staff
          </Button>
        }
      />
      <div className={styles.stack}>
        <PeopleCard onAdd={openAdd} />
        <PermissionMatrix />
      </div>
      <AddStaffModal key={addKey} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
