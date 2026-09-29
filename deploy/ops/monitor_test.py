import unittest
from monitor import should_notify

class Notifications(unittest.TestCase):
    def test_transitions_and_reminders(self):
        self.assertFalse(should_notify({}, [], 100))
        self.assertTrue(should_notify({}, ['down'], 100))
        previous = {'issues': ['down'], 'sentAt': 100}
        self.assertFalse(should_notify(previous, ['down'], 200))
        self.assertTrue(should_notify(previous, [], 200))
        self.assertTrue(should_notify(previous, ['disk'], 200))
        self.assertTrue(should_notify(previous, ['down'], 21700))

if __name__ == '__main__':
    unittest.main()
