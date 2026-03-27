import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import styles from '../section-placeholder.module.css';

type ActionLink = {
  href: string;
  label: string;
};

type AdminSectionPlaceholderProps = {
  title: string;
  description: string;
  actions: ActionLink[];
};

export default function AdminSectionPlaceholder({
  title,
  description,
  actions,
}: AdminSectionPlaceholderProps) {
  return (
    <section className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>

        <div className={styles.actions}>
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className={styles.actionLink}>
              {action.label}
              <ChevronRight size={16} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

