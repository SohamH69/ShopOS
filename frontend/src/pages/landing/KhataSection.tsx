import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import { KHATA_EXAMPLE } from "./content";
import styles from "./KhataSection.module.css";
import layout from "./Landing.module.css";

const OUTSTANDING = KHATA_EXAMPLE[KHATA_EXAMPLE.length - 1].balance;

/** "Your khata, without the notebook": a ruled ledger with the red margin line, and a reminder. */
export function KhataSection() {
  return (
    <section className={cx(layout.band, layout.desk)} aria-labelledby="khata-title">
      <div className={cx(layout.container, styles.grid)}>
        <div className={styles.copy}>
          <p className={layout.eyebrow}>Khata</p>
          <h2 id="khata-title" className={layout.title}>
            Your khata, without the notebook.
          </h2>
          <p className={layout.lede}>
            Every sale on credit lands in the customer's khata with a running balance. Part payments clear the oldest
            orders first, and a polite reminder goes out on WhatsApp in one tap.
          </p>
          <ul className={styles.points}>
            <li>Dues add up by themselves, so no adding up pages at night</li>
            <li>Record a promise like “I’ll pay on Friday”, and see when it’s missed</li>
            <li>Settled accounts get the violet stamp</li>
          </ul>
        </div>

        <div className={styles.illustration}>
          <div className={styles.ledger} role="group" aria-labelledby="khata-example-name">
            <div className={styles.ledgerHead}>
              <div>
                <p id="khata-example-name" className={styles.customer}>
                  Rahul Sharma
                </p>
                <p className={styles.phone}>+91 98765 43210</p>
              </div>
              <div className={styles.headBalance}>
                <p className={styles.headLabel}>Outstanding</p>
                <p className={styles.headAmount}>{formatMoney(OUTSTANDING)}</p>
              </div>
            </div>

            <table className={styles.table}>
              <caption className="visually-hidden">Khata entries for Rahul Sharma, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Activity</th>
                  <th scope="col" className={styles.numeric}>
                    Amount
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {KHATA_EXAMPLE.map((entry) => (
                  <tr key={entry.key}>
                    <td className={styles.date}>{entry.date}</td>
                    <td>
                      <span className={styles.activity}>{entry.activity}</span>
                      <span className={styles.reference}> · {entry.reference}</span>
                    </td>
                    <td className={cx(styles.numeric, entry.amount < 0 ? styles.payment : styles.purchase)}>
                      {entry.amount < 0 ? formatMoney(entry.amount) : `+${formatMoney(entry.amount)}`}
                    </td>
                    <td className={cx(styles.numeric, styles.balance)}>{formatMoney(entry.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Outstanding
                  </th>
                  <td className={cx(styles.numeric, styles.outstanding)}>{formatMoney(OUTSTANDING)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <figure className={styles.reminder}>
            <figcaption className={styles.reminderCaption}>One tap sends this reminder on WhatsApp</figcaption>
            <div className={styles.bubble}>
              <p>Namaste Rahul, {formatMoney(OUTSTANDING)} is pending on your account at Raj Local Mart.</p>
              <p className={styles.bubbleTime}>6:42 pm</p>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
